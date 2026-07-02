import { Logger, type Provider } from '@nestjs/common';
import { createAuth, maskPhoneNumber, type EmailSender, type SmsSender } from '@print-karo/auth';
import { ROLES, AUDIT_ACTIONS } from '@print-karo/types';
import { AUTH_INSTANCE, EMAIL_SENDER, SMS_SENDER } from './auth.tokens';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Builds the singleton Better Auth instance for the app, wiring in the
 * injected email/SMS senders plus hooks that provision a CustomerProfile on
 * first sign-up and write the auth audit trail (OTP sent/verified, sign-ups).
 */
export const authProvider: Provider = {
  provide: AUTH_INSTANCE,
  inject: [EMAIL_SENDER, SMS_SENDER, PrismaService, AuditService],
  useFactory: (
    emailSender: EmailSender,
    smsSender: SmsSender,
    prisma: PrismaService,
    audit: AuditService,
  ) => {
    const logger = new Logger('Auth');

    return createAuth({
      emailSender,
      smsSender,
      onUserCreated: async (user) => {
        try {
          // Every self-service signup is a CUSTOMER and gets a profile row.
          // Phone-OTP signups carry the verified number into the profile.
          await prisma.client.customerProfile.upsert({
            where: { userId: user.id },
            update: user.phoneNumber ? { phone: user.phoneNumber } : {},
            create: { userId: user.id, phone: user.phoneNumber ?? undefined },
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
            metadata: user.phoneNumber
              ? { phoneNumber: maskPhoneNumber(user.phoneNumber) }
              : { email: user.email },
          });
        } catch (err) {
          logger.error(`onUserCreated hook failed: ${String(err)}`);
        }
      },
      onPhoneOtpSent: async (info) => {
        await audit.record({
          action: AUDIT_ACTIONS.PHONE_OTP_SENT,
          targetType: 'PhoneNumber',
          metadata: { phoneNumber: maskPhoneNumber(info.phoneNumber) },
        });
      },
      onPhoneVerified: async (info) => {
        try {
          // Keep the customer profile's contact number in sync with the
          // verified identity (covers sign-ins that predate the profile row).
          await prisma.client.customerProfile.updateMany({
            where: { userId: info.userId },
            data: { phone: info.phoneNumber },
          });
          await audit.record({
            action: AUDIT_ACTIONS.PHONE_VERIFIED,
            actorUserId: info.userId,
            targetType: 'User',
            targetId: info.userId,
            metadata: { phoneNumber: maskPhoneNumber(info.phoneNumber) },
          });
        } catch (err) {
          logger.error(`onPhoneVerified hook failed: ${String(err)}`);
        }
      },
    });
  },
};
