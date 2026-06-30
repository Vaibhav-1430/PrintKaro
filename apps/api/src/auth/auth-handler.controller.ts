import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Auth } from '@print-karo/auth';
import { Public } from '../rbac/decorators';
import { AUTH_INSTANCE } from './auth.tokens';

/**
 * Mounts the Better Auth handler at /api/auth/*. Better Auth owns register,
 * login, logout, OAuth, email verification and password reset over the Web
 * Fetch API; we adapt Express <-> Fetch here. Public (Better Auth does its own
 * auth) and excluded from the response envelope.
 */
@Public()
@Controller('api/auth')
export class AuthHandlerController {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const response = await this.auth.handler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const text = await response.text();
    res.send(text);
  }
}
