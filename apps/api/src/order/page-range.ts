/**
 * Pure page-range helpers. A range string is like "1-3,5,7-9". Pages are clamped
 * to [1, totalPages] and de-duplicated, so the count is the number of distinct
 * pages that will actually print.
 */
export function parsePageRange(range: string, totalPages: number): number[] {
  const pages = new Set<number>();
  for (const part of range.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const dash = trimmed.indexOf('-');
    if (dash === -1) {
      const n = Number(trimmed);
      if (Number.isInteger(n)) addInRange(pages, n, n, totalPages);
    } else {
      const start = Number(trimmed.slice(0, dash));
      const end = Number(trimmed.slice(dash + 1));
      if (Number.isInteger(start) && Number.isInteger(end)) {
        addInRange(pages, Math.min(start, end), Math.max(start, end), totalPages);
      }
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function countPagesInRange(range: string, totalPages: number): number {
  return parsePageRange(range, totalPages).length;
}

function addInRange(set: Set<number>, start: number, end: number, totalPages: number): void {
  const lo = Math.max(1, start);
  const hi = Math.min(totalPages, end);
  for (let p = lo; p <= hi; p++) set.add(p);
}
