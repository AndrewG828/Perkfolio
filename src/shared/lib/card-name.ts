/** Short name for card visuals, e.g. "The Platinum Card® from American Express" -> "Platinum". */
export function shortCardName(name: string): string {
  return name
    .replace(/®/g, "")
    .replace(/^The /, "")
    .replace(/^Citi \/ /, "")
    .replace(/\bfrom American Express\b|\bAmerican Express\b/g, "")
    .replace(/\b(Visa Infinite|Visa Signature|World Legend Mastercard|Visa)\b/g, "")
    .replace(/\b(Cash Rewards|Rewards) Credit Card\b|\bCredit Card\b|\bCard\b/g, "")
    .replace(/^(Chase|Capital One|Citi|Wells Fargo) /, "")
    .replace(/\s+/g, " ")
    .trim();
}
