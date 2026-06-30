import { COLOR_MODES } from '@print-karo/types';
import { PricingService } from './pricing.service';
import type { PricingRepository } from './pricing.repository';

function make() {
  const repo = {
    findActiveRule: jest.fn(),
    listRules: jest.fn(),
    upsertRule: jest.fn(),
  } as unknown as PricingRepository;
  return { svc: new PricingService(repo), repo };
}

const input = {
  machineId: '00000000-0000-0000-0000-000000000000',
  copies: 2,
  colorMode: COLOR_MODES.BW,
  duplex: false,
  paperSize: 'A4' as const,
  pagesToPrint: 5,
};

describe('PricingService.calculate', () => {
  it('uses the DB rule when present', async () => {
    const { svc, repo } = make();
    (repo.findActiveRule as jest.Mock).mockResolvedValue({
      bwPerPagePaise: 300,
      colorPerPagePaise: 1500,
      duplexDiscountPct: 0,
    });
    const b = await svc.calculate(input);
    expect(b.totalPaise).toBe(300 * 5 * 2);
  });

  it('falls back to the default rule when none configured', async () => {
    const { svc, repo } = make();
    (repo.findActiveRule as jest.Mock).mockResolvedValue(null);
    const b = await svc.calculate(input);
    expect(b.totalPaise).toBe(200 * 5 * 2);
  });
});

describe('PricingService.upsertRule', () => {
  it('normalises a missing machineId to null', async () => {
    const { svc, repo } = make();
    (repo.upsertRule as jest.Mock).mockResolvedValue({
      id: 'r1',
      machineId: null,
      paperSize: 'A4',
      bwPerPagePaise: 200,
      colorPerPagePaise: 1000,
      duplexDiscountPct: 0,
      active: true,
    });
    await svc.upsertRule({
      paperSize: 'A4',
      bwPerPagePaise: 200,
      colorPerPagePaise: 1000,
      duplexDiscountPct: 0,
      active: true,
    });
    expect(repo.upsertRule).toHaveBeenCalledWith(expect.objectContaining({ machineId: null }));
  });
});
