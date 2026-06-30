/** Format integer paise as ₹ rupees (e.g. 1250 → "₹12.50"). */
export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
