import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

interface RefreshTokenClaims {
  sub: string;
  sid: string;
  family: string;
  type: 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

const accessLifetimeSeconds = 15 * 60;
const refreshLifetimeSeconds = 7 * 24 * 60 * 60;
const dummyPasswordHash = bcrypt.hash('invalid-login-timing-placeholder', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto): Promise<AuthTokens> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            name: input.name.trim(),
            email,
            passwordHash,
          },
        });
        await transaction.organisation.create({
          data: {
            name: input.organisationName.trim(),
            type: input.organisationType,
            ownerUserId: createdUser.id,
            members: {
              create: {
                userId: createdUser.id,
                role: MembershipRole.OWNER,
                status: MembershipStatus.ACTIVE,
                joinedAt: new Date(),
              },
            },
          },
        });
        return createdUser;
      });

      return this.createTokens(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('email')
      ) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(input: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? (await dummyPasswordHash),
    );

    if (!user || user.status !== 'ACTIVE' || !passwordMatches) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    return this.createTokens(user);
  }

  async refresh(rawToken: string | undefined): Promise<AuthTokens> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const claims = await this.verifyRefreshToken(rawToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });

    if (!session || session.userId !== claims.sub || session.tokenFamilyId !== claims.family) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    if (session.revokedAt) {
      await this.revokeTokenFamily(claims.family);
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const suppliedHash = this.hashToken(rawToken);
    const storedHash = Buffer.from(session.refreshTokenHash, 'hex');
    const actualHash = Buffer.from(suppliedHash, 'hex');
    if (
      storedHash.length !== actualHash.length ||
      !timingSafeEqual(storedHash, actualHash)
    ) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    if (session.user.status !== 'ACTIVE') {
      await this.revokeTokenFamily(claims.family);
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.buildTokens(session.user, claims.family);
    const now = new Date();
    const rotated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          refreshTokenHash: suppliedHash,
        },
        data: { revokedAt: now },
      });

      if (result.count !== 1) {
        await transaction.authSession.updateMany({
          where: { tokenFamilyId: claims.family, revokedAt: null },
          data: { revokedAt: now },
        });
        return false;
      }

      await transaction.authSession.create({
        data: {
          id: tokens.sessionId,
          userId: session.userId,
          tokenFamilyId: claims.family,
          refreshTokenHash: this.hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + refreshLifetimeSeconds * 1000),
        },
      });
      return true;
    });

    if (!rotated) {
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.toAuthenticatedUser(session.user),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const claims = await this.verifyRefreshToken(rawToken);
    await this.prisma.authSession.updateMany({
      where: {
        id: claims.sid,
        userId: claims.sub,
        tokenFamilyId: claims.family,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async getUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is unavailable');
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  private async createTokens(user: AuthenticatedUser): Promise<AuthTokens> {
    const tokens = await this.buildTokens(user, randomUUID());
    await this.prisma.authSession.create({
      data: {
        id: tokens.sessionId,
        userId: user.id,
        tokenFamilyId: tokens.familyId,
        refreshTokenHash: this.hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + refreshLifetimeSeconds * 1000),
      },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }

  private async buildTokens(
    user: AuthenticatedUser,
    familyId: string,
  ): Promise<AuthTokens & { sessionId: string; familyId: string }> {
    const sessionId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, sid: sessionId, type: 'access' },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          algorithm: 'HS256',
          issuer: 'propease-api',
          audience: 'propease-web',
          expiresIn: accessLifetimeSeconds,
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, sid: sessionId, family: familyId, type: 'refresh' },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithm: 'HS256',
          issuer: 'propease-api',
          audience: 'propease-web',
          expiresIn: refreshLifetimeSeconds,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      user,
      sessionId,
      familyId,
    };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
    let claims: RefreshTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshTokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer: 'propease-api',
        audience: 'propease-web',
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new UnauthorizedException('Refresh token is invalid or expired');
      }
      throw error;
    }

    if (
      claims.type !== 'refresh' ||
      !claims.sub ||
      !claims.sid ||
      !claims.family
    ) {
      throw new UnauthorizedException('Refresh token is invalid');
    }
    return claims;
  }

  private async revokeTokenFamily(familyId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenFamilyId: familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(user: AuthenticatedUser): AuthenticatedUser {
    return { id: user.id, name: user.name, email: user.email };
  }
}
