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
  }
}
