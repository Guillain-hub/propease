import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from './email.service.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

describe('EmailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends email using authenticated SMTP with transport security', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const close = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
      close,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const config = {
      get: (key: string) =>
        ({
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_SECURE: 'false',
          SMTP_USERNAME: 'smtp-user',
          SMTP_PASSWORD: 'smtp-password',
          EMAIL_FROM_ADDRESS: 'security@example.com',
        })[key],
    };
    const service = new EmailService(config as ConfigService);

    await service.send('person@example.com', 'Subject', 'Message');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'smtp-user', pass: 'smtp-password' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: 'security@example.com',
      to: 'person@example.com',
      subject: 'Subject',
      text: 'Message',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails explicitly when SMTP settings are incomplete', async () => {
    const service = new EmailService({
      get: () => undefined,
    } as ConfigService);

    await expect(
      service.send('person@example.com', 'Subject', 'Message'),
    ).rejects.toThrow(/SMTP_HOST.*must be configured/);
  });
});
