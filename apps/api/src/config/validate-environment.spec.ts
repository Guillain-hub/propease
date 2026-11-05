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
});
