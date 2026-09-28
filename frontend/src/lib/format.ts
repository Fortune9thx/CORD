/** Small display helpers. */

export const shortAddr = (a?: string) =>
  !a ? "—" : a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export const fmtDate = (unix: number) =>
  !unix
    ? "—"
    : new Date(unix * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

export const fmtDateTime = (unix: number) =>
  !unix ? "—" : new Date(unix * 1000).toLocaleString();

/** Wei → GEN, trimmed. Bonds are small, so a few decimals is plenty. */
export function fmtGen(wei: string | number | bigint): string {
  const v = BigInt(typeof wei === "number" ? Math.trunc(wei) : wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export const relativeExpiry = (unix: number) => {
  const days = Math.round((unix * 1000 - Date.now()) / 86_400_000);
  if (days < 0) return `expired ${Math.abs(days)}d ago`;
  if (days === 0) return "expires today";
  return `${days}d left`;
};
