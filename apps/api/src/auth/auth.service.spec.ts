import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { AuthService } from './auth.service.js';

function makeService(user: unknown, resetToken: unknown = null) {
  const tokenRecord = { id: 'reset-token-1', userId: 'user-1' };
  const transaction = {
    passwordResetToken: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: tokenRecord.id }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { update: vi.fn().mockResolvedValue({}) },
    authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    passwordResetToken: {
      findFirst: vi.fn().mockResolvedValue(resetToken),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const configValues: Record<string, string> = {
    AWS_REGION: 'us-east-1',
    EMAIL_FROM_ADDRESS: 'security@example.com',
    APP_ORIGINS: 'https://app.example.com',
  };
  const config = {
    get: (key: string) => configValues[key],
    getOrThrow: (key: string) => {
      const value = configValues[key];
      if (!value) throw new Error(`${key} is required`);
      return value;
    },
  };
  const send = vi.fn().mockResolvedValue(undefined);
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    config as ConfigService,
    { send } as unknown as EmailService,
  );
  return { service, prisma, transaction, send };
}

describe('AuthService password recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the same response for an unknown account without sending mail', async () => {
    const { service, send } = makeService(null);

    const result = await service.requestPasswordReset({
      email: 'unknown@example.com',
    });

    expect(result.message).toMatch(/if an active account exists/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('stores only a hash and emails a one-hour reset link', async () => {
    const user = { id: 'user-1', email: 'owner@example.com', status: 'ACTIVE' };
    const { service, transaction, send } = makeService(user);

    const result = await service.requestPasswordReset({
      email: ' OWNER@example.com ',
    });

    expect(result.message).toMatch(/if an active account exists/i);
    expect(transaction.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][2]).toContain(
      'https://app.example.com/reset-password?token=',
    );
  });

  it('rejects invalid or expired reset links', async () => {
    const { service, prisma } = makeService(null, null);

    await expect(
      service.resetPassword('a'.repeat(64), 'a-secure-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('changes the password and revokes existing sessions atomically', async () => {
    const resetToken = { id: 'reset-token-1', userId: 'user-1' };
    const { service, transaction } = makeService(null, resetToken);

    await expect(
      service.resetPassword('a'.repeat(64), 'a-secure-password'),
    ).resolves.toMatchObject({ message: expect.stringMatching(/reset/i) });

    expect(transaction.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: resetToken.id, usedAt: null }),
      }),
    );
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: resetToken.userId },
        data: { passwordHash: expect.any(String) },
      }),
    );
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: resetToken.userId, revokedAt: null },
      }),
    );
  });
});

describe('AuthService invitation registration', () => {
  it('creates the invitee directly in the invited landlord workspace', async () => {
    const invitation = {
      id: 'invitation-1',
      organisationId: 'organisation-1',
      role: 'MANAGER',
      propertyIds: ['property-1'],
    };
    const createdUser = {
      id: 'user-2',
      name: 'New manager',
      email: 'manager@example.com',
    };
    const transaction = {
      organisationInvitation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { create: vi.fn().mockResolvedValue(createdUser) },
      organisationMember: { create: vi.fn().mockResolvedValue({}) },
      propertyAssignment: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      organisationInvitation: {
        findFirst: vi.fn().mockResolvedValue(invitation),
      },
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      authSession: { create: vi.fn().mockResolvedValue({}) },
    };
    const config = {
      get: vi.fn(),
      getOrThrow: vi.fn((key: string) => `${key}-test-secret`),
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue('signed-token') };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      { send: vi.fn() } as unknown as EmailService,
    );

    await service.register({
      name: createdUser.name,
      email: createdUser.email,
      password: 'a-secure-password',
      invitationToken: 'a'.repeat(64),
    });

    expect(prisma.organisationInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: createdUser.email,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          acceptedAt: null,
        }),
      }),
    );
    expect(
      transaction.organisationInvitation.updateMany,
    ).toHaveBeenCalledOnce();
    expect(transaction.organisationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organisationId: invitation.organisationId,
          userId: createdUser.id,
          role: invitation.role,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(transaction.propertyAssignment.createMany).toHaveBeenCalledWith({
      data: [{ propertyId: 'property-1', userId: createdUser.id }],
    });
    expect(prisma.authSession.create).toHaveBeenCalledOnce();
  });
});

describe('AuthService Google OAuth', () => {
  it('creates a short-lived signed state and requests verified identity scopes', async () => {
    const configValues: Record<string, string> = {
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_REDIRECT_URI:
        'http://localhost:4000/api/v1/auth/google/callback',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
    };
    const config = {
      get: (key: string) => configValues[key],
      getOrThrow: (key: string) => {
        const value = configValues[key];
        if (!value) throw new Error(`${key} is required`);
        return value;
      },
    };
    const jwt = new JwtService({});
    const service = new AuthService(
      {} as PrismaService,
      jwt,
      config as ConfigService,
      {} as EmailService,
    );

    const result = await service.createGoogleAuthorizationUrl({
      flow: 'register',
      name: 'New landlord',
      organisationName: 'North Homes',
      organisationType: 'LANDLORD',
    });
    const authorizationUrl = new URL(result.authorizationUrl);
    const state = await jwt.verifyAsync<{
      state: string;
      nonce: string;
      purpose: string;
      organisationName: string;
    }>(result.stateCookie, {
      secret: configValues.JWT_ACCESS_SECRET,
      issuer: 'propease-api',
      audience: 'propease-google-oauth',
    });

    expect(authorizationUrl.origin).toBe('https://accounts.google.com');
    expect(authorizationUrl.searchParams.get('client_id')).toBe(
      configValues.GOOGLE_CLIENT_ID,
    );
    expect(authorizationUrl.searchParams.get('state')).toBe(state.state);
    expect(authorizationUrl.searchParams.get('nonce')).toBe(state.nonce);
    expect(authorizationUrl.searchParams.get('scope')).toContain('email');
    expect(state).toMatchObject({
      purpose: 'google-oauth',
      organisationName: 'North Homes',
    });
  });

  it('refuses Google sign-in when OAuth credentials are not configured', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as JwtService,
      {
        get: () => undefined,
        getOrThrow: (key: string) => {
          throw new Error(`${key} is required`);
        },
      } as ConfigService,
      {} as EmailService,
    );

    await expect(
      service.createGoogleAuthorizationUrl({ flow: 'login' }),
    ).rejects.toThrow(/Google sign-in is not configured/);
  });
});
