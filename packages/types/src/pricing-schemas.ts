import { z } from 'zod';

/**
 * Pricing domain (Sprint 4). All money is integer paise — never floats. The
 * price calculator is a pure function of the rule + options; rules are admin
 * configurable per machine + paper size (machineId null = global default).
 */

export const COLOR_MODES = {
  BW: 'BW',
  COLOR: 'COLOR',
} as const;
export type ColorMode = (typeof COLOR_MODES)[keyof typeof COLOR_MODES];

export const PAPER_SIZES = ['A4', 'A3', 'LEGAL'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

// ── Calculate price (customer) ───────────────────────────────────────
export const calculatePriceSchema = z.object({
  machineId: z.string().uuid(),
  copies: z.number().int().min(1).max(500),
  colorMode: z.nativeEnum(COLOR_MODES).default(COLOR_MODES.BW),
  duplex: z.boolean().default(false),
  paperSize: z.enum(PAPER_SIZES).default('A4'),
  pagesToPrint: z.number().int().min(1).max(10_000),
});
export type CalculatePriceInput = z.infer<typeof calculatePriceSchema>;

// ── Admin pricing rule upsert ────────────────────────────────────────
export const pricingRuleSchema = z.object({
  machineId: z.string().uuid().nullish(),
  paperSize: z.enum(PAPER_SIZES).default('A4'),
  bwPerPagePaise: z.number().int().min(0).max(1_000_000),
  colorPerPagePaise: z.number().int().min(0).max(1_000_000),
  duplexDiscountPct: z.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
});
export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;

// ── Response DTOs ────────────────────────────────────────────────────
export interface PriceBreakdown {
  perPagePaise: number;
  pagesToPrint: number;
  copies: number;
  colorMode: ColorMode;
  duplex: boolean;
  paperSize: string;
  /** Pre-discount subtotal = perPagePaise * pagesToPrint * copies. */
  subtotalPaise: number;
  /** Duplex discount applied to the subtotal (>= 0). */
  duplexDiscountPaise: number;
  totalPaise: number;
  currency: string;
}

export interface PricingRuleResponse {
  id: string;
  machineId: string | null;
  paperSize: string;
  bwPerPagePaise: number;
  colorPerPagePaise: number;
  duplexDiscountPct: number;
  active: boolean;
}
