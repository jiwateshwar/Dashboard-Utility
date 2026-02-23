import { app } from "./app.js";
import { env } from "./utils/env.js";
import "./jobs/scheduler.js";
app.listen(env.port, () => {
    console.log(`PRISM backend listening on port ${env.port}`);
});
