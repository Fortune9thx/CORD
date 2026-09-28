/** Wallet-scoped activity: the grants you hold or granted, and what you can claim. */

import { useEffect, useState } from "react";

import { useHealth, useWallet } from "../components/Chrome";
import { TxButton } from "../components/Forms";
import { Empty, ErrorNote, Eyebrow, Section, Spinner } from "../components/ui";
import { getClaimable, listGrants, write } from "../lib/chain";
import { fmtGen, shortAddr } from "../lib/format";
import type { Grant } from "../lib/types";
import { GrantRow } from "./Grants";

export default function Activity() {
  const health = useHealth();
  const { account, connect, available } = useWallet();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [claimable, setClaimable] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    if (health.state !== "live" || !account) {
      setGrants(health.state === "live" ? null : []);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [all, owed] = await Promise.all([
          listGrants(),
          getClaimable(account).catch(() => "0"),
        ]);
        if (!alive) return;
        const me = account.toLowerCase();
        setGrants(all.filter((g) => g.grantee === me || g.grantor === me));
        setClaimable(owed);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [health.state, account]);

  if (!account) {
    return (
      <Section className="py-8">
        <div className="card p-10 text-center">
          <Eyebrow>Activity</Eyebrow>
          <h1 className="h-display mx-auto mt-3 max-w-sm text-[28px]">
            Connect a wallet to see your grants
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-mute">
            Activity is scoped to one address — the grants it holds, the grants it issued, and any
            bond settlements waiting to be claimed.
          </p>
          <button onClick={connect} disabled={!available} className="btn-primary mt-7">
            + Connect wallet
          </button>
          {!available && (
            <p className="mt-3 text-[12px] text-mute">No injected wallet was found in this browser.</p>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section className="space-y-6 py-8">
      <div className="card p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <Eyebrow>Activity</Eyebrow>
            <h1 className="h-display mt-2.5 text-[30px]">
              <span className="font-mono text-[24px]">{shortAddr(account)}</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="label">Claimable</p>
            <p className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">
              {fmtGen(claimable)} <span className="text-[15px] text-mute">GEN</span>
            </p>
          </div>
        </div>

        {claimable !== "0" && (
          <div className="mt-7 border-t border-slate-100 pt-7">
            <TxButton onRun={() => write("claim", [])}>+ Claim settlements</TxButton>
            <p className="mt-3 text-[12px] text-mute">
              Payouts are pull-only, so nothing is ever pushed to an address that cannot receive it.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <ErrorNote error={error} />
      ) : grants === null ? (
        <Spinner />
      ) : grants.length === 0 ? (
        <Empty
          title="No grants for this address"
          hint={
            health.state === "live"
              ? "Nothing on chain names this address as a grantor or grantee."
              : "Nothing can be read until the contract is live on Studio Dev."
          }
        />
      ) : (
        <div className="space-y-4">
          {grants.map((g) => (
            <GrantRow key={g.id} grant={g} />
          ))}
        </div>
      )}
    </Section>
  );
}
