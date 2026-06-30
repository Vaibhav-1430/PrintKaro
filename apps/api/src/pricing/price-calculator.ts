import { COLOR_MODES, type CalculatePriceInput, type PriceBreakdown } from '@print-karo/types';

/** The pricing inputs the calculator needs from a resolved rule. */
export interface ResolvedPricingRule {
  bwPerPagePaise: number;
  colorPerPagePaise: number;
  duplexDiscountPct: number; // 0–100
}

/**
 * Pure price calculator. No I/O, no DI — fully unit-testable. Money is integer
 * paise throughout; the duplex discount is applied to the per-page price and the
 * result is floored to whole paise so totals never carry fractional currency.
 */
export function computePrice(rule: ResolvedPricingRule, opts: CalculatePriceInput): PriceBreakdown {
  const isColor = opts.colorMode === COLOR_MODES.COLOR;
  const basePerPage = isColor ? rule.colorPerPagePaise : rule.bwPerPagePaise;

  // Duplex discount reduces the effective per-page cost (e.g. paper savings).
  const discountPct = opts.duplex ? clampPct(rule.duplexDiscountPct) : 0;
  const perPagePaise = Math.floor((basePerPage * (100 - discountPct)) / 100);

  const subtotalPaise = basePerPage * opts.pagesToPrint * opts.copies;
  const totalPaise = perPagePaise * opts.pagesToPrint * opts.copies;
  const duplexDiscountPaise = subtotalPaise - totalPaise;

  return {
    perPagePaise,
    pagesToPrint: opts.pagesToPrint,
    copies: opts.copies,
    colorMode: opts.colorMode,
    duplex: opts.duplex,
    paperSize: opts.paperSize,
    subtotalPaise,
    duplexDiscountPaise,
    totalPaise,
    currency: 'INR',
  };
}

function clampPct(pct: number): number {
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.floor(pct);
}
