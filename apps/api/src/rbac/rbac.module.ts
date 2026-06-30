import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { SessionService } from './session.service';

/**
 * Shared RBAC providers. Global so guards (registered app-wide) can resolve
 * SessionService/PermissionService. AUTH_INSTANCE + MachineTokenService are
 * provided by AuthModule/MachineModule and imported where needed.
 */
@Global()
@Module({
  providers: [PermissionService, SessionService],
  exports: [PermissionService, SessionService],
})
export class RbacModule {}
