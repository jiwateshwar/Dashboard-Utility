import dotenv from "dotenv";
dotenv.config();
const required = ["DATABASE_URL", "SESSION_SECRET"];
for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing env var: ${key}`);
    }
}
export const env = {
    port: Number(process.env.PORT || 4000),
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173"
};
