// Only our web app may call the API from a browser. Other sites get no CORS
// headers, so the browser blocks them. The web app sends the refresh cookie,
// so credentials are allowed for it alone.

const METHODS = "GET, POST, PUT, PATCH, DELETE";
// Prefer lets the web app ask the mock server for an error, such as code=409.
const REQUEST_HEADERS = "Authorization, Content-Type, Idempotency-Key, Prefer";
const RESPONSE_HEADERS = "X-Request-Id, Retry-After";

/** @param {string} webOrigin Such as http://localhost:5173. */
export function allowWebApp(webOrigin) {
  const allowed = new URL(webOrigin).origin;

  return function cors(req, res, next) {
    res.vary("Origin");
    const fromWebApp = req.get("origin") === allowed;
    if (fromWebApp) {
      res.set({
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers": RESPONSE_HEADERS,
      });
    }

    const isPreflight =
      req.method === "OPTIONS" && req.get("access-control-request-method");
    if (!isPreflight) return next();

    if (fromWebApp) {
      res.set({
        "Access-Control-Allow-Methods": METHODS,
        "Access-Control-Allow-Headers": REQUEST_HEADERS,
        "Access-Control-Max-Age": "600",
      });
    }
    res.status(204).end();
  };
}
