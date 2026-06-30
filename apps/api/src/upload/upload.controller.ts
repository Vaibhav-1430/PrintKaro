import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  PERMISSIONS,
  confirmUploadSchema,
  requestUploadSchema,
  type ConfirmUploadInput,
  type RequestUploadInput,
} from '@print-karo/types';
import { UploadService } from './upload.service';
import { Customer } from '../rbac/role-decorators';
import { CurrentUser } from '../rbac/decorators';
import { ZodBody } from '../common/zod-body.decorator';
import type { AuthPrincipal } from '../rbac/auth-context';

/** Customer upload endpoints. Bytes go straight to storage via presigned URLs. */
@Customer(PERMISSIONS.ORDER_CREATE)
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post('request')
  requestUpload(
    @CurrentUser() user: AuthPrincipal,
    @ZodBody(requestUploadSchema) body: RequestUploadInput,
  ) {
    return this.uploads.requestUpload(user, body);
  }

  @Post(':id/confirm')
  confirmUpload(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(confirmUploadSchema) body: ConfirmUploadInput,
  ) {
    return this.uploads.confirmUpload(user, id, body);
  }

  @Get(':id')
  getUpload(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.getUpload(user, id);
  }

  @Get()
  listUploads(@CurrentUser() user: AuthPrincipal) {
    return this.uploads.listUploads(user);
  }
}
