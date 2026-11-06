import { app } from "./app.js";
import { env } from "./utils/env.js";
import "./jobs/scheduler.js";

// Backstop for promise rejections outside a request (scheduled jobs, timers):
// log them instead of letting Node exit and take the site down.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

app.listen(env.port, () => {
  console.log(`PRISM backend listening on port ${env.port}`);
});
