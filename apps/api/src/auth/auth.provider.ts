import { Logger, type Provider } from '@nestjs/common';
import { createAuth, type EmailSender } from '@print-karo/auth';
import { ROLES, AUDIT_ACTIONS } from '@print-karo/types';
import { AUTH_INSTANCE, EMAIL_SENDER } from './auth.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Builds the singleton Better Auth instance for the app, wiring in the
 * injected email sender and a database hook that provisions a CustomerProfile
 * (and audits) whenever a new user signs up.
 */
export const authProvider: Provider = {
  provide: AUTH_INSTANCE,
  inject: [EMAIL_SENDER, PrismaService, AuditService],
  useFactory: (emailSender: EmailSender, prisma: PrismaService, audit: AuditService) => {
    const logger = new Logger('Auth');

    return createAuth({
      emailSender,
      onUserCreated: async (user) => {
        try {
          // Every self-service signup is a CUSTOMER and gets a profile row.
          await prisma.client.customerProfile.upsert({
            where: { userId: user.id },
            update: {},
            create: { userId: user.id },
          });
          await prisma.client.user.update({
            where: { id: user.id },
            data: { role: ROLES.CUSTOMER },
          });
          await audit.record({
            action: AUDIT_ACTIONS.USER_REGISTERED,
            actorUserId: user.id,
            targetType: 'User',
            targetId: user.id,
            metadata: { email: user.email },
          });
        } catch (err) {
          logger.error(`onUserCreated hook failed: ${String(err)}`);
        }
      },
    });
  },
};
