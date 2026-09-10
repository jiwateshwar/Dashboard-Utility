import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "SESSION_SECRET"] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL as string,
  sessionSecret: process.env.SESSION_SECRET as string,
  // Multiple origins can serve this app simultaneously (e.g. a raw IP and a
  // domain behind a reverse proxy) — comma-separated in CORS_ORIGIN. Also
  // used to validate which origin a request is actually arriving from
  // before trusting it to build an Entra ID redirect_uri (see auth.ts).
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  snapshotDir: process.env.SNAPSHOT_DIR || "./data/snapshots",
  snapshotRetentionWeekly: Number(process.env.SNAPSHOT_RETENTION_WEEKLY || 12),
  snapshotRetentionSafety: Number(process.env.SNAPSHOT_RETENTION_SAFETY || 5),
  snapshotMaxUploadMb: Number(process.env.SNAPSHOT_MAX_UPLOAD_MB || 500)
};
