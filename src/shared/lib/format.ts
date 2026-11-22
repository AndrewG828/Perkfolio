export const usd = (n: number, opts: { cents?: boolean } = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.cents ? 2 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  }).format(n);

export const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
