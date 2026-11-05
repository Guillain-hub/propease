import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenClaims } from './auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser requires JwtAccessGuard');
    }
    return request.user;
  },
);
