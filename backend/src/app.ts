import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "./utils/env.js";
import { pool } from "./db.js";
import { router } from "./routes/index.js";

const PgSession = pgSession(session);

export const app = express();

// Trust the first proxy hop (Cloudflare tunnel / nginx).
// Required so express-rate-limit can read X-Forwarded-For without throwing.
app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again in a minute" }
});

app.use(
  session({
    store: new PgSession({
      pool,
      createTableIfMissing: true
    }),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    // Extend the session on activity instead of a fixed expiry from login —
    // otherwise an active user's session can lapse mid-use on whatever page
    // they happen to be on, which looks like "this page logged me out".
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // Safe to require HTTPS-only cookies: nginx terminates TLS and sends
      // X-Forwarded-Proto, which Express trusts via `trust proxy` above.
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use("/api", apiLimiter, router);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Global error handler — catches any unhandled thrown errors in route handlers
// and returns a JSON 500 instead of crashing the process.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled error]", err);
  if (err.code === "23505") {
    return res.status(409).json({ error: "A record with that value already exists" });
  }
  res.status(500).json({ error: "Internal server error" });
});
