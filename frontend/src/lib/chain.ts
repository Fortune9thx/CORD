/**
 * Chain access, fail-closed.
 *
 * Nothing here ever invents a grant. Every read either returns what the chain
 * said or throws, and the UI renders an empty state rather than a placeholder.
 */

import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL, isTargetChain } from "./config";
import type { Grant, Review, UseRecord } from "./types";

let rpcId = 1;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method}: http ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${json.error.message ?? "failed"}`);
  return json.result as T;
}

/** The banner states, evaluated in this order. */
export type Health =
  | { state: "checking" }
  | { state: "undeployed" }
  | { state: "rpc-down"; detail: string }
  | { state: "wrong-chain"; found: number }
  | { state: "no-code"; address: string }
  | { state: "live"; address: string };

export async function checkHealth(): Promise<Health> {
  if (!CONTRACT_ADDRESS) return { state: "undeployed" };

  let chainHex: string;
  try {
    chainHex = await rpc<string>("eth_chainId", []);
  } catch (e) {
    return { state: "rpc-down", detail: e instanceof Error ? e.message : "unreachable" };
  }

  const found = Number.parseInt(chainHex, 16);
  if (!isTargetChain(found)) return { state: "wrong-chain", found };

  try {
    const code = await rpc<string>("eth_getCode", [CONTRACT_ADDRESS, "latest"]);
    // Studio Dev resets wipe state; an address with no code is not live.
    if (!code || code === "0x" || code === "0x0") {
      return { state: "no-code", address: CONTRACT_ADDRESS };
    }
  } catch (e) {
    return { state: "rpc-down", detail: e instanceof Error ? e.message : "unreachable" };
  }

  return { state: "live", address: CONTRACT_ADDRESS };
}

/* -------------------------------------------------------------------------
 * Contract reads
 *
 * genlayer-js is loaded lazily so a missing or incompatible build degrades to
 * an error banner instead of breaking the whole bundle at import time.
 * ---------------------------------------------------------------------- */

type ReadArgs = { method: string; args: unknown[] };

let clientPromise: Promise<any> | null = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const gl: any = await import("genlayer-js");
      const chain = {
        id: CHAIN_ID,
        name: "GenLayer Studio Dev",
        rpcUrls: { default: { http: [RPC_URL] } },
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
      };
      return gl.createClient({ chain, endpoint: RPC_URL });
    })();
  }
  return clientPromise;
}

async function read<T = string>({ method, args }: ReadArgs): Promise<T> {
  if (!CONTRACT_ADDRESS) throw new Error("contract address is not configured");
  const client = await getClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
  }) as Promise<T>;
}

/** Contract views return JSON strings; "" means "no such record". */
function parseOrNull<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getGrant(id: string): Promise<Grant | null> {
  return parseOrNull<Grant>(await read({ method: "get_grant", args: [id] }));
}

export async function getChildren(id: string): Promise<string[]> {
  return parseOrNull<string[]>(await read({ method: "get_children", args: [id] })) ?? [];
}

export async function getReview(id: string): Promise<Review | null> {
  return parseOrNull<Review>(await read({ method: "get_review", args: [id] }));
}

export async function getUses(grantId: string): Promise<string[]> {
  return parseOrNull<string[]>(await read({ method: "get_uses", args: [grantId] })) ?? [];
}

export async function getUse(useId: string): Promise<UseRecord | null> {
  return parseOrNull<UseRecord>(await read({ method: "get_prove_use", args: [useId] }));
}

export async function getConfig(): Promise<Record<string, unknown> | null> {
  return parseOrNull(await read({ method: "get_config", args: [] }));
}

export async function canInvoke(
  grantId: string,
  actor: string,
  capability: string,
  resource: string,
): Promise<{ allowed: boolean; reason: string }> {
  const raw = await read({
    method: "can_invoke",
    args: [grantId, actor, capability, resource],
  });
  const parsed = parseOrNull<{ allowed: boolean; reason: string }>(raw);
  // Fail closed: an unreadable answer is a denial, never an approval.
  return parsed ?? { allowed: false, reason: "no readable answer from the contract" };
}

export async function getClaimable(addr: string): Promise<string> {
  const raw = await read({ method: "get_claimable", args: [addr] });
  return typeof raw === "string" && raw !== "" ? raw : "0";
}

/**
 * Walk the grant ids the contract has issued.
 *
 * The contract numbers ids sequentially from `g1`, and `get_config` reports the
 * next id, so the board enumerates that range and keeps whatever exists. Ids in
 * the range that were issued to `prove_use` records simply read as empty.
 */
export async function listGrants(limit = 60): Promise<Grant[]> {
  const cfg = await getConfig();
  const next = Number(cfg?.next_id ?? 1);
  const ids: string[] = [];
  for (let i = Math.max(1, next - limit); i < next; i++) ids.push(`g${i}`);

  const settled = await Promise.allSettled(ids.map((id) => getGrant(id)));
  const grants: Grant[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) grants.push(r.value);
  }
  return grants.reverse();
}

/* -------------------------------------------------------------------------
 * Writes — injected wallet
 * ---------------------------------------------------------------------- */

function eth(): any {
  const e = (window as any).ethereum;
  if (!e) throw new Error("no injected wallet found");
  return e;
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).ethereum);
}

export async function connect(): Promise<string> {
  const accounts: string[] = await eth().request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("wallet returned no account");
  await ensureChain();
  return accounts[0];
}

export async function currentAccount(): Promise<string | null> {
  if (!hasWallet()) return null;
  try {
    const accounts: string[] = await eth().request({ method: "eth_accounts" });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

/** Switch the wallet to 61997, adding the network if it is not known yet. */
export async function ensureChain(): Promise<void> {
  try {
    await eth().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err: any) {
    if (err?.code !== 4902) throw err;
    await eth().request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "GenLayer Studio Dev",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        },
      ],
    });
  }
}

export async function write(
  method: string,
  args: unknown[],
  value = 0n,
): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error("contract address is not configured");
  await ensureChain();
  const account = await connect();
  const gl: any = await import("genlayer-js");
  const chain = {
    id: CHAIN_ID,
    name: "GenLayer Studio Dev",
    rpcUrls: { default: { http: [RPC_URL] } },
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  };
  const client = gl.createClient({ chain, endpoint: RPC_URL, account });
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
    value,
  });
}
