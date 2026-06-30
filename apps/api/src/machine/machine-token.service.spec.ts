import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { MachineTokenService } from './machine-token.service';
import type { PrismaService } from '../prisma/prisma.service';

const config = {
  get: (_k: string, d: number) => d,
} as unknown as ConfigService;

function makeJwt() {
  return new JwtService({ secret: 'test-secret-1234567890', signOptions: {} });
}

describe('MachineTokenService', () => {
  describe('verifyAccessToken', () => {
    it('accepts a valid token for an active machine', async () => {
      const jwt = makeJwt();
      const prisma = {
        client: { machine: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', code: 'PK-1' }) } },
      } as unknown as PrismaService;
      const svc = new MachineTokenService(jwt, config, prisma);
      const token = await jwt.signAsync({ sub: 'm1', code: 'PK-1', type: 'machine' });
      await expect(svc.verifyAccessToken(token)).resolves.toEqual({
        machineId: 'm1',
        code: 'PK-1',
      });
    });

    it('rejects a token whose machine is not active', async () => {
      const jwt = makeJwt();
      const prisma = {
        client: { machine: { findFirst: jest.fn().mockResolvedValue(null) } },
      } as unknown as PrismaService;
      const svc = new MachineTokenService(jwt, config, prisma);
      const token = await jwt.signAsync({ sub: 'm1', code: 'PK-1', type: 'machine' });
      await expect(svc.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a non-machine token', async () => {
      const jwt = makeJwt();
      const prisma = { client: { machine: { findFirst: jest.fn() } } } as unknown as PrismaService;
      const svc = new MachineTokenService(jwt, config, prisma);
      const token = await jwt.signAsync({ sub: 'm1', code: 'PK-1', type: 'human' });
      await expect(svc.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('rotateRefreshToken', () => {
    it('rejects an unknown refresh token', async () => {
      const prisma = {
        client: { refreshToken: { findUnique: jest.fn().mockResolvedValue(null) } },
      } as unknown as PrismaService;
      const svc = new MachineTokenService(makeJwt(), config, prisma);
      await expect(svc.rotateRefreshToken('nope', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes the whole chain when a revoked token is reused', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 3 });
      const prisma = {
        client: {
          refreshToken: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'rt1',
              machineId: 'm1',
              revoked: true,
              expiresAt: new Date(Date.now() + 10000),
              machine: { id: 'm1', code: 'PK-1', deletedAt: null, status: 'ACTIVE' },
            }),
            updateMany,
          },
        },
      } as unknown as PrismaService;
      const svc = new MachineTokenService(makeJwt(), config, prisma);
      await expect(svc.rotateRefreshToken('reused', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revoked: true }) }),
      );
    });

    it('issues a new pair and revokes the old token on valid rotation', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'rt-new' });
      const update = jest.fn().mockResolvedValue({});
      const prisma = {
        client: {
          refreshToken: {
            findUnique: jest
              .fn()
              // first call: look up the presented token
              .mockResolvedValueOnce({
                id: 'rt-old',
                machineId: 'm1',
                revoked: false,
                expiresAt: new Date(Date.now() + 100000),
                machine: { id: 'm1', code: 'PK-1', deletedAt: null, status: 'ACTIVE' },
              })
              // second call: look up the freshly-created replacement by hash
              .mockResolvedValueOnce({ id: 'rt-new' }),
            create,
            update,
          },
        },
      } as unknown as PrismaService;
      const svc = new MachineTokenService(makeJwt(), config, prisma);
      const { tokens, machineId } = await svc.rotateRefreshToken('valid', {});
      expect(machineId).toBe('m1');
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-old' },
          data: expect.objectContaining({ revoked: true, replacedById: 'rt-new' }),
        }),
      );
    });
  });
});
