import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    pendingOtpUserId?: string;
    entraAuth?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      createdAt: number;
    };
    /** In-app path to land on after SSO login (e.g. a task link from an email). */
    ssoReturnTo?: string;
  }
}
