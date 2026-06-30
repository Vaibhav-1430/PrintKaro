import { PIN_STATUSES } from '@print-karo/types';
import { attemptsRemaining, canRedeem, generatePin, isExpired, type PinState } from './pin-policy';

function pin(overrides: Partial<PinState> = {}): PinState {
  return {
    status: PIN_STATUSES.ACTIVE,
    attempts: 0,
    maxAttempts: 3,
    expiresAt: new Date(Date.now() + 3_600_000),
    ...overrides,
  };
}

describe('generatePin', () => {
  it('always produces a 4-digit string', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePin();
      expect(p).toMatch(/^\d{4}$/);
    }
  });
});

describe('isExpired', () => {
  it('is false before expiry', () => {
    expect(isExpired({ expiresAt: new Date(Date.now() + 1000) })).toBe(false);
  });
  it('is true at/after expiry', () => {
    expect(isExpired({ expiresAt: new Date(Date.now() - 1) })).toBe(true);
  });
});

describe('attemptsRemaining', () => {
  it('counts down', () => {
    expect(attemptsRemaining({ attempts: 0, maxAttempts: 3 })).toBe(3);
    expect(attemptsRemaining({ attempts: 2, maxAttempts: 3 })).toBe(1);
  });
  it('never goes negative', () => {
    expect(attemptsRemaining({ attempts: 5, maxAttempts: 3 })).toBe(0);
  });
});

describe('canRedeem', () => {
  it('allows an active, fresh PIN with attempts left', () => {
    expect(canRedeem(pin())).toBe(true);
  });
  it('blocks an expired PIN', () => {
    expect(canRedeem(pin({ expiresAt: new Date(Date.now() - 1) }))).toBe(false);
  });
  it('blocks an exhausted PIN', () => {
    expect(canRedeem(pin({ attempts: 3 }))).toBe(false);
  });
  it.each([PIN_STATUSES.REDEEMED, PIN_STATUSES.EXPIRED, PIN_STATUSES.REVOKED])(
    'blocks a %s PIN',
    (status) => {
      expect(canRedeem(pin({ status }))).toBe(false);
    },
  );
});
