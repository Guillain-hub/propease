import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  MembershipRole,
  MembershipStatus,
  OrganisationType,
  Prisma,
} from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RequestPasswordResetDto } from './dto/request-password-reset.dto.js';
import type { GoogleAuthStartDto } from './dto/google-auth-start.dto.js';
import { ensureTrialSubscription } from '../landlord/trial-subscription.js';

interface RefreshTokenClaims {
  sub: string;
  sid: string;
  family: string;
  type: 'refresh';
}

interface GoogleOAuthState extends GoogleAuthStartDto {
  purpose: 'google-oauth';
  state: string;
  nonce: string;
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
const passwordResetLifetimeMs = 60 * 60 * 1000;
const dummyPasswordHash = bcrypt.hash('invalid-login-timing-placeholder', 12);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(input: RegisterDto): Promise<AuthTokens> {
    const email = input.email.trim().toLowerCase();
    const invitation = input.invitationToken
      ? await this.prisma.organisationInvitation.findFirst({
          where: {
            tokenHash: this.hashToken(input.invitationToken),
            email,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: {
            id: true,
            organisationId: true,
            role: true,
            propertyIds: true,
          },
        })
      : null;
    if (input.invitationToken && !invitation) {
      throw new BadRequestException(
        'This invitation link is invalid or expired',
      );
    }
    if (
      !invitation &&
      (!input.organisationName?.trim() || !input.organisationType)
    ) {
      throw new BadRequestException('Organisation details are required');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        if (invitation) {
          const claimed = await transaction.organisationInvitation.updateMany({
            where: {
              id: invitation.id,
              acceptedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { acceptedAt: new Date() },
          });
          if (claimed.count !== 1) {
            throw new BadRequestException(
              'This invitation link is invalid or expired',
            );
          }
        }
        const createdUser = await transaction.user.create({
          data: {
            name: input.name.trim(),
            email,
            passwordHash,
          },
        });
        if (invitation) {
          await transaction.organisationMember.create({
            data: {
              organisationId: invitation.organisationId,
              userId: createdUser.id,
              role: invitation.role,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            },
          });
          if (invitation.propertyIds.length) {
            await transaction.propertyAssignment.createMany({
              data: invitation.propertyIds.map((propertyId) => ({
                propertyId,
                userId: createdUser.id,
              })),
            });
          }
          await transaction.auditLog.create({
            data: {
              organisationId: invitation.organisationId,
              userId: createdUser.id,
              action: 'team.invitation_accepted',
              entityType: 'organisation_member',
              entityId: createdUser.id,
            },
          });
          return createdUser;
        }
        const organisation = await transaction.organisation.create({
          data: {
            name: input.organisationName!.trim(),
            type: input.organisationType!,
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
          select: { id: true },
        });
        await ensureTrialSubscription(transaction, organisation.id);
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
        throw new ConflictException(
          'An account with this email already exists',
        );
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

  async createGoogleAuthorizationUrl(
    input: GoogleAuthStartDto,
  ): Promise<{ authorizationUrl: string; stateCookie: string }> {
    if (
      input.flow === 'register' &&
      !input.invitationToken &&
      (!input.organisationName?.trim() || !input.organisationType)
    ) {
      throw new BadRequestException(
        'Organisation details are required to create a new workspace',
      );
    }

    const client = this.createGoogleClient();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const stateCookie = await this.jwt.signAsync(
      {
        ...input,
        purpose: 'google-oauth',
        state,
        nonce,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: 'propease-api',
        audience: 'propease-google-oauth',
        expiresIn: 5 * 60,
      },
    );
    return {
      stateCookie,
      authorizationUrl: client.generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
      }),
    };
  }

  async authenticateWithGoogle(
    code: string,
    state: string,
    stateCookie: string | undefined,
  ): Promise<AuthTokens> {
    if (!stateCookie) {
      throw new UnauthorizedException('Google sign-in state is missing');
    }

    let oauthState: GoogleOAuthState;
    try {
      oauthState = await this.jwt.verifyAsync<GoogleOAuthState>(stateCookie, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: 'propease-api',
        audience: 'propease-google-oauth',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Google sign-in state is invalid or expired');
    }

    if (oauthState.purpose !== 'google-oauth' || !oauthState.nonce) {
      throw new UnauthorizedException('Google sign-in state is invalid');
    }
    if (!oauthState.state || oauthState.state !== state) {
      throw new UnauthorizedException('Google sign-in state does not match');
    }

    const client = this.createGoogleClient();
    let payload: TokenPayload | undefined;
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Google did not return an ID token');
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google identity could not be verified');
    }
    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      payload.nonce !== oauthState.nonce
    ) {
      throw new UnauthorizedException(
        'Google must verify the email address to continue',
      );
    }

    const email = payload.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true },
    });
    if (existing?.status === 'DISABLED') {
      throw new UnauthorizedException('This account is unavailable');
    }

    if (existing) {
      if (oauthState.invitationToken) {
        await this.acceptGoogleInvitation(
          existing.id,
          email,
          oauthState.invitationToken,
        );
      }
      return this.createTokens(existing);
    }

    if (oauthState.flow !== 'register') {
      throw new UnauthorizedException(
        'No PropEase account is linked to this Google account. Create an account first.',
      );
    }

    const name =
      payload.name?.trim() ||
      email.split('@')[0] ||
      'Google user';
    const password = randomBytes(48).toString('base64url');
    return this.register({
      name: name.slice(0, 160),
      email,
      password,
      ...(oauthState.invitationToken
        ? { invitationToken: oauthState.invitationToken }
        : {
            organisationName: oauthState.organisationName,
            organisationType:
              oauthState.organisationType ?? OrganisationType.LANDLORD,
          }),
    });
  }

  frontendUrl(path: string): string {
    const origin =
      this.config.get<string>('WEB_APP_URL')?.trim() ||
      this.config.getOrThrow<string>('APP_ORIGINS').split(',')[0].trim();
    return new URL(path, origin).toString();
  }

  private createGoogleClient(): OAuth2Client {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      );
    }
    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  private async acceptGoogleInvitation(
    userId: string,
    email: string,
    token: string,
  ): Promise<void> {
    const invitation = await this.prisma.organisationInvitation.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        organisationId: true,
        role: true,
        propertyIds: true,
      },
    });
    if (!invitation) {
      throw new BadRequestException('This invitation link is invalid or expired');
    }

    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.organisationInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('This invitation link is invalid or expired');
      }
      await transaction.organisationMember.upsert({
        where: {
          organisationId_userId: {
            organisationId: invitation.organisationId,
            userId,
          },
        },
        create: {
          organisationId: invitation.organisationId,
          userId,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
        update: {
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      await transaction.propertyAssignment.deleteMany({
        where: { userId, property: { organisationId: invitation.organisationId } },
      });
      if (invitation.propertyIds.length) {
        await transaction.propertyAssignment.createMany({
          data: invitation.propertyIds.map((propertyId) => ({
            propertyId,
            userId,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          organisationId: invitation.organisationId,
          userId,
          action: 'team.invitation_accepted',
          entityType: 'organisation_member',
          entityId: userId,
        },
      });
    });
  }

  async requestPasswordReset(
    input: RequestPasswordResetDto,
  ): Promise<{ message: string }> {
    const message =
      'If an active account exists for that email, password reset instructions will be sent.';
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return { message };

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      return transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + passwordResetLifetimeMs),
        },
        select: { id: true },
      });
    });

    try {
      const appUrl =
        this.config.get<string>('WEB_APP_URL')?.trim() ||
        this.config.getOrThrow<string>('APP_ORIGINS').split(',')[0].trim();
      const resetUrl = new URL('/reset-password', appUrl);
      resetUrl.searchParams.set('token', token);

      await this.email.send(
        user.email,
        'Reset your PropEase password',
        [
          'We received a request to reset your PropEase password.',
          '',
          `Use this link within 1 hour: ${resetUrl.toString()}`,
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
      );
    } catch (error) {
      await this.prisma.passwordResetToken.deleteMany({
        where: { id: resetToken.id, usedAt: null },
      });
      this.logger.error(
        `Password reset email could not be sent for user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { message };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true, userId: true },
    });
    if (!resetToken) {
      throw new BadRequestException(
        'This password reset link is invalid or expired',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'This password reset link is invalid or expired',
        );
      }

      await transaction.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    return { message: 'Your password has been reset. You can now log in.' };
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

    if (
      !session ||
      session.userId !== claims.sub ||
      session.tokenFamilyId !== claims.family
    ) {
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
