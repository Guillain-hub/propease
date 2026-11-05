export interface AccessTokenClaims {
  sub: string;
  sid: string;
  type: 'access';
}

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
      organisationRole?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
      cookies?: Record<string, string | undefined>;
    }
  }
}
