import type { MembershipRole } from '@prisma/client';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  type: 'access';
}

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
      organisationRole?: MembershipRole;
      cookies?: Record<string, string | undefined>;
    }
  }
}
