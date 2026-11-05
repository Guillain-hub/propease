import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAccessGuard } from './jwt-access.guard.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { AccessTokenClaims } from './auth.types.js';
import type { AuthTokens } from './auth.service.js';

const accessCookie = 'access_token';
const refreshCookie = 'refresh_token';
type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Res({ passthrough: true }) response: Response,
    @Body() input: RegisterDto,
  ): Promise<{ user: AuthTokens['user'] }> {
    const tokens = await this.auth.register(input);
    this.setCookies(response, tokens);
    return { user: tokens.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Res({ passthrough: true }) response: Response,
    @Body() input: LoginDto,
  ): Promise<{ user: AuthTokens['user'] }> {
    const tokens = await this.auth.login(input);
    this.setCookies(response, tokens);
    return { user: tokens.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthTokens['user'] }> {
    const tokens = await this.auth.refresh(request.cookies?.[refreshCookie]);
    this.setCookies(response, tokens);
    return { user: tokens.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(request.cookies?.[refreshCookie]);
    response.clearCookie(accessCookie, this.cookieOptions('/api/v1'));
    response.clearCookie(refreshCookie, this.cookieOptions('/api/v1/auth'));
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  async me(
    @CurrentUser() user: AccessTokenClaims,
  ): Promise<{ user: AuthTokens['user'] }> {
    return { user: await this.auth.getUser(user.sub) };
  }

  private setCookies(
    response: Response,
    tokens: AuthTokens,
  ): void {
    response.cookie(accessCookie, tokens.accessToken, {
      ...this.cookieOptions('/api/v1'),
      maxAge: 15 * 60 * 1000,
    });
    response.cookie(refreshCookie, tokens.refreshToken, {
      ...this.cookieOptions('/api/v1/auth'),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions(path: string): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path,
    };
  }
}
