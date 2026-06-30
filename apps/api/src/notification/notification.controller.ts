import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Authenticated } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import type { AuthPrincipal } from '../rbac/auth-context';

/** In-app notifications for the authenticated user. */
@Authenticated()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.listMine(user.userId);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id, user.userId);
  }
}
