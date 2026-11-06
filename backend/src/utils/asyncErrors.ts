// Express 4 does not catch errors from async route handlers: a rejected
// promise becomes an unhandled rejection, which crashes the whole Node
// process (taking the site down for everyone). This patches Express's router
// layer so a rejected promise is passed to next(err) and reaches the global
// error handler in app.ts, which returns a JSON 500 for that one request.
// Same approach as the express-async-errors package, without the dependency.
// Must be imported before any routes are registered.
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Layer = require("express/lib/router/layer.js");

const original = Layer.prototype.handle_request;
Layer.prototype.handle_request = function patchedHandleRequest(req: any, res: any, next: any) {
  const fn = this.handle;
  // Error-handling middleware (4 args) and non-function handlers keep stock behaviour.
  if (typeof fn !== "function" || fn.length > 3) return original.call(this, req, res, next);
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === "function") result.catch(next);
  } catch (err) {
    next(err);
  }
};
