import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';
import type { AccessTokenClaims } from './auth.types.js';

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    const token = request.cookies?.access_token ?? bearerToken;

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: 'propease-api',
        audience: 'propease-web',
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new UnauthorizedException('Access token is invalid or expired');
      }
      throw error;
    }

    if (claims.type !== 'access' || !claims.sub || !claims.sid) {
      throw new UnauthorizedException('Access token is invalid');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      select: { userId: true, revokedAt: true, user: { select: { status: true } } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Session is no longer active');
    }

    request.user = claims;
    return true;
  }
}
