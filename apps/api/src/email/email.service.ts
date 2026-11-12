import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const portValue = this.config.get<string>('SMTP_PORT')?.trim() || '587';
    const port = Number(portValue);
    const username = this.config.get<string>('SMTP_USERNAME')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const sender = this.config.get<string>('EMAIL_FROM_ADDRESS')?.trim();

    if (!host || !username || !password || !sender) {
      throw new Error(
        'SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and EMAIL_FROM_ADDRESS must be configured',
      );
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be an integer between 1 and 65535');
    }

    const secure =
      this.config.get<string>('SMTP_SECURE')?.trim().toLowerCase() === 'true' ||
      port === 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: username, pass: password },
    });

    try {
      await transporter.sendMail({ from: sender, to, subject, text });
    } finally {
      transporter.close();
    }
  }
}
