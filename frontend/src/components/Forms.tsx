/** Form pieces shared by the create, delegate and prove pages. */

import { useState } from "react";
import type { ReactNode } from "react";

import { MAX_CLAUSES } from "../lib/limits";
import { useIsLive } from "./Chrome";

export type Clause = { id: string; text: string };

export function ClauseEditor({
  clauses,
  onChange,
}: {
  clauses: Clause[];
  onChange: (c: Clause[]) => void;
}) {
  const add = () =>
    onChange([...clauses, { id: `c${clauses.length + 1}`, text: "" }]);

  const set = (i: number, patch: Partial<Clause>) =>
    onChange(clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const remove = (i: number) => onChange(clauses.filter((_, j) => j !== i));

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label mb-0">Clauses (plain language)</p>
        <span className="text-[11px] text-mute">
          {clauses.length}/{MAX_CLAUSES}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        These are what validators judge. Write the limits you actually mean — vague wording is
        what gets a proposal ruled ambiguous, and an ambiguous clause pair is locked until the
        text materially changes.
      </p>

      <div className="mt-4 space-y-3">
        {clauses.map((c, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex items-center gap-2">
              <input
                value={c.id}
                onChange={(e) => set(i, { id: e.target.value })}
                placeholder="id"
                className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto text-[11px] font-bold uppercase tracking-[0.1em] text-mute hover:text-rose-600"
              >
                Remove
              </button>
            </div>
            <textarea
              value={c.text}
              onChange={(e) => set(i, { text: e.target.value })}
              rows={2}
              maxLength={600}
              placeholder="e.g. Spend only on cloud hosting invoices, up to $500 per month."
              className="field mt-2 resize-y"
            />
          </div>
        ))}
      </div>

      {clauses.length < MAX_CLAUSES && (
        <button type="button" onClick={add} className="btn-ghost mt-3">
          + Add clause
        </button>
      )}
    </div>
  );
}

/** Comma- or newline-separated token entry. */
export function TokenInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field font-mono text-[13px]"
      />
      {hint && <p className="mt-2 text-[12px] text-mute">{hint}</p>}
    </div>
  );
}

export const parseTokens = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

/**
 * A submit button that refuses to pretend.
 *
 * Writes are disabled unless the contract is confirmed live, and the result of
 * the last attempt is shown verbatim rather than summarised as "success".
 */
export function TxButton({
  onRun,
  children,
  disabled,
}: {
  onRun: () => Promise<string>;
  children: ReactNode;
  disabled?: boolean;
}) {
  const live = useIsLive();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await onRun() });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled || !live}
        className="btn-primary"
        title={live ? undefined : "The contract is not live on Studio Dev"}
      >
        {busy ? "Submitting…" : children}
      </button>

      {!live && (
        <p className="mt-3 text-[12px] text-mute">
          Writes are disabled until the contract is confirmed live on Studio Dev.
        </p>
      )}

      {result && (
        <div
          className={`mt-4 rounded-xl border p-4 text-[13px] ${
            result.ok
              ? "border-emerald-100 bg-emerald-50 text-emerald-900"
              : "border-rose-100 bg-rose-50 text-rose-900"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-70">
            {result.ok ? "Submitted" : "Rejected"}
          </p>
          <p className="mt-1.5 break-words font-mono text-[12px]">{result.text}</p>
        </div>
      )}
    </div>
  );
}

export function FormCard({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="card p-8 sm:p-10">
      <h1 className="h-display text-[28px]">{title}</h1>
      <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-mute">{lead}</p>
      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}

/** Expiry entry as a date, converted to the unix seconds the contract stores. */
export function ExpiryInput({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: number;
}) {
  return (
    <div>
      <p className="label">Expiry</p>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
      {max ? (
        <p className="mt-2 text-[12px] text-mute">
          Must not outlast the parent, which expires{" "}
          {new Date(max * 1000).toLocaleDateString()}.
        </p>
      ) : null}
    </div>
  );
}

export const toUnix = (date: string): number =>
  date ? Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000) : 0;
