/** Fail-closed access check: exactly what can_invoke answers, nothing softened. */

import { useState } from "react";

import { useHealth } from "../components/Chrome";
import { Eyebrow, Section } from "../components/ui";
import { canInvoke } from "../lib/chain";

type Result = { allowed: boolean; reason: string } | null;

export default function Checks() {
  const health = useHealth();
  const [grantId, setGrantId] = useState("");
  const [actor, setActor] = useState("");
  const [capability, setCapability] = useState("");
  const [resource, setResource] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = Boolean(grantId.trim() && actor.trim() && capability.trim() && resource.trim());

  const run = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await canInvoke(grantId.trim(), actor.trim(), capability.trim(), resource.trim()));
    } catch (e) {
      // An unreadable answer is a denial, not an unknown.
      setError(e instanceof Error ? e.message : String(e));
      setResult({ allowed: false, reason: "the chain could not be read" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section className="py-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card p-8 sm:p-10">
          <Eyebrow>Authority</Eyebrow>
          <h1 className="h-display mt-2.5 text-[28px]">Access check</h1>
          <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-mute">
            Asks the contract the only question that matters at invocation time. It denies unless
            the grant exists, the actor is its grantee, the capability and resource are in scope,
            and every ancestor up to the root is effective.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="label">Grant id</p>
              <input value={grantId} onChange={(e) => setGrantId(e.target.value)} placeholder="g3" className="field font-mono text-[13px]" />
            </div>
            <div className="sm:col-span-2">
              <p className="label">Actor address</p>
              <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="0x…" className="field font-mono text-[13px]" />
            </div>
            <div>
              <p className="label">Capability</p>
              <input value={capability} onChange={(e) => setCapability(e.target.value)} placeholder="payments.send" className="field font-mono text-[13px]" />
            </div>
            <div>
              <p className="label">Resource</p>
              <input value={resource} onChange={(e) => setResource(e.target.value)} placeholder="acct.ops" className="field font-mono text-[13px]" />
            </div>
          </div>

          <button
            onClick={run}
            disabled={!ready || busy || health.state !== "live"}
            className="btn-primary mt-7"
            title={health.state === "live" ? undefined : "The contract is not live on Studio Dev"}
          >
            {busy ? "Checking…" : "+ Run check"}
          </button>

          {health.state !== "live" && (
            <p className="mt-3 text-[12px] text-mute">
              Checks need a live contract — there is nothing on chain to ask.
            </p>
          )}
        </div>

        <div className="card flex flex-col p-8 sm:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Result</p>

          {!result ? (
            <div className="flex flex-1 items-center justify-center py-14 text-center">
              <p className="max-w-xs text-sm text-mute">
                No check run yet. CORD does not guess — it either has an answer from the chain or
                it has none.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <div
                className={`rounded-2xl p-6 ${
                  result.allowed ? "bg-emerald-50" : "bg-rose-50"
                }`}
              >
                <p
                  className={`text-[26px] font-extrabold tracking-[-0.02em] ${
                    result.allowed ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {result.allowed ? "Allowed" : "Denied"}
                </p>
                {result.reason && (
                  <p
                    className={`mt-2 text-sm ${
                      result.allowed ? "text-emerald-800" : "text-rose-800"
                    }`}
                  >
                    {result.reason}
                  </p>
                )}
              </div>

              {error && (
                <p className="mt-4 break-words font-mono text-[12px] text-mute">{error}</p>
              )}

              <p className="mt-6 border-t border-slate-100 pt-5 text-[12px] leading-relaxed text-mute">
                This is the contract's own answer, returned verbatim. A missing grant, a wrong
                actor, an expired or tainted grant, and any ineffective ancestor all read as
                denied.
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
