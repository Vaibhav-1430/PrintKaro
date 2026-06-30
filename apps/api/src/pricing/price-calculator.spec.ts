import { COLOR_MODES, type CalculatePriceInput } from '@print-karo/types';
import { computePrice, type ResolvedPricingRule } from './price-calculator';

const rule: ResolvedPricingRule = {
  bwPerPagePaise: 200,
  colorPerPagePaise: 1000,
  duplexDiscountPct: 20,
};

function opts(overrides: Partial<CalculatePriceInput> = {}): CalculatePriceInput {
  return {
    machineId: '00000000-0000-0000-0000-000000000000',
    copies: 1,
    colorMode: COLOR_MODES.BW,
    duplex: false,
    paperSize: 'A4',
    pagesToPrint: 1,
    ...overrides,
  };
}

describe('computePrice', () => {
  it('prices a single BW page at the BW per-page rate', () => {
    const b = computePrice(rule, opts());
    expect(b.perPagePaise).toBe(200);
    expect(b.totalPaise).toBe(200);
    expect(b.duplexDiscountPaise).toBe(0);
  });

  it('prices a single colour page at the colour rate', () => {
    const b = computePrice(rule, opts({ colorMode: COLOR_MODES.COLOR }));
    expect(b.perPagePaise).toBe(1000);
    expect(b.totalPaise).toBe(1000);
  });

  it('multiplies by pages and copies', () => {
    const b = computePrice(rule, opts({ pagesToPrint: 10, copies: 3 }));
    expect(b.subtotalPaise).toBe(200 * 10 * 3);
    expect(b.totalPaise).toBe(200 * 10 * 3);
  });

  it('applies the duplex discount to the per-page price', () => {
    const b = computePrice(rule, opts({ duplex: true, pagesToPrint: 10 }));
    // 200 * (100-20)/100 = 160 per page.
    expect(b.perPagePaise).toBe(160);
    expect(b.totalPaise).toBe(160 * 10);
    expect(b.duplexDiscountPaise).toBe(200 * 10 - 160 * 10);
  });

  it('floors fractional paise after the duplex discount', () => {
    const oddRule: ResolvedPricingRule = { ...rule, bwPerPagePaise: 199, duplexDiscountPct: 33 };
    const b = computePrice(oddRule, opts({ duplex: true }));
    // floor(199 * 67 / 100) = floor(133.33) = 133.
    expect(b.perPagePaise).toBe(133);
  });

  it('ignores the duplex discount when duplex is off', () => {
    const b = computePrice(rule, opts({ duplex: false }));
    expect(b.perPagePaise).toBe(200);
    expect(b.duplexDiscountPaise).toBe(0);
  });

  it('clamps a >100% discount to 100 (free) and a negative to 0', () => {
    const over: ResolvedPricingRule = { ...rule, duplexDiscountPct: 150 };
    expect(computePrice(over, opts({ duplex: true })).perPagePaise).toBe(0);
    const under: ResolvedPricingRule = { ...rule, duplexDiscountPct: -10 };
    expect(computePrice(under, opts({ duplex: true })).perPagePaise).toBe(200);
  });

  it('always reports INR', () => {
    expect(computePrice(rule, opts()).currency).toBe('INR');
  });

  it.each([1, 2, 5, 50, 500])('handles %i copies linearly', (copies) => {
    const b = computePrice(rule, opts({ copies, pagesToPrint: 4 }));
    expect(b.totalPaise).toBe(200 * 4 * copies);
  });

  it.each(['A4', 'A3', 'LEGAL'] as const)('carries paper size %s through', (paperSize) => {
    expect(computePrice(rule, opts({ paperSize })).paperSize).toBe(paperSize);
  });
});
