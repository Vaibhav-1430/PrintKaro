import { Controller, Delete, Get, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { updateProfileSchema, type UpdateProfileInput } from '@print-karo/types';
import { AuthService } from './auth.service';
import { CurrentUser } from '../rbac/decorators';
import { Authenticated } from '../rbac/role-decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/**
 * Custom authenticated user endpoints. Register/login/logout/verify/reset are
 * handled by Better Auth under /api/auth/*; these cover identity & sessions.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @Authenticated()
  me(@CurrentUser() user: AuthPrincipal) {
    return this.authService.me(user);
  }

  @Patch('profile')
  @Authenticated()
  updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @ZodBody(updateProfileSchema) body: UpdateProfileInput,
    @Req() req: Request,
  ) {
    return this.authService.updateProfile(user, body, req);
  }

  @Get('sessions')
  @Authenticated()
  sessions(@CurrentUser() user: AuthPrincipal) {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  @Authenticated()
  async revokeSession(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.authService.revokeSession(user, id, req);
    return { revoked: true };
  }

  @Delete('logout-all')
  @Authenticated()
  logoutAll(@CurrentUser() user: AuthPrincipal, @Req() req: Request) {
    return this.authService.logoutAll(user, req);
  }
}
