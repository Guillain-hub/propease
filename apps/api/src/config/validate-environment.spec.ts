import { validateEnvironment } from './validate-environment.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/propease',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnvironment', () => {
  it('requires a database URL and both token secrets', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Missing required environment variables: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET',
    );
  });

  it('rejects short token secrets', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow('JWT_ACCESS_SECRET must be at least 32 characters long');
  });

  it('validates the port and supplies safe development defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      PORT: 4000,
      NODE_ENV: 'development',
      APP_ORIGINS: 'http://localhost:3000',
      REDIS_URL: 'redis://localhost:6379',
      AWS_REGION: 'us-east-1',
    });
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('requires all Google OAuth settings together and validates the callback URL', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_CLIENT_ID: 'client-id',
      }),
    ).toThrow(
      'Google sign-in requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI',
    );
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI: 'javascript:alert(1)',
      }),
    ).toThrow('GOOGLE_REDIRECT_URI must be a valid HTTP(S) URL');
    expect(
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI:
          'http://localhost:4000/api/v1/auth/google/callback',
      }),
    ).toMatchObject({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_REDIRECT_URI:
        'http://localhost:4000/api/v1/auth/google/callback',
    });
  });
});
