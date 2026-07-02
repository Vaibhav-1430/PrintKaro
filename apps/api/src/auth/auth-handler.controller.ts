import { All, Controller, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Auth } from '@print-karo/auth';
import { Public } from '../rbac/decorators';
import { AUTH_INSTANCE } from './auth.tokens';

/**
 * Better Auth endpoints that must not be reachable over public HTTP.
 * Customers authenticate with phone OTP only; staff accounts are created
 * server-side via auth.api.signUpEmail (which bypasses this controller).
 */
const BLOCKED_PUBLIC_PATHS = new Set(['/sign-up/email']);

/**
 * Mounts the Better Auth handler at /api/auth/*. Better Auth owns login,
 * logout, phone OTP, OAuth and password reset over the Web Fetch API; we
 * adapt Express <-> Fetch here. Public (Better Auth does its own auth) and
 * excluded from the response envelope.
 */
@Public()
@Controller('api/auth')
export class AuthHandlerController {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);

    const authPath = url.pathname.replace(/^\/api\/auth/, '').replace(/\/+$/, '') || '/';
    if (BLOCKED_PUBLIC_PATHS.has(authPath)) {
      throw new NotFoundException('Not found');
    }

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
    // Set-Cookie must be forwarded as individual headers: Headers.forEach()
    // comma-joins duplicates, which browsers cannot parse back into cookies.
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
    const text = await response.text();
    res.send(text);
  }
}
