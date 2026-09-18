/**
 * POST /api/access/redeem — exchange a 6-digit invite code for a session cookie.
 *
 * SERVER-ROUTE API, this version: TanStack Start 1.168.32 declares server
 * handlers as the `server.handlers` option on an ordinary file route.
 * `@tanstack/start-client-core/serverRoute.d.ts` augments router-core's
 * `FilebaseRouteOptionsInterface` with `server?: RouteServerOptions`, whose
 * `handlers` is `Partial<Record<RouteMethod, RouteMethodHandlerFn>>`. The
 * handler receives `{ request, params, pathname, context, next }` and returns a
 * web-standard `Response`. There is no `createAPIFileRoute` / `createServerFileRoute`
 * in this version — that module is types-only and ships no runtime.
 */

import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP, setCookie } from "@tanstack/react-start/server";
import { codeStore } from "@/server/access/codeStore";
import { ACCESS_COOKIE_NAME, ACCESS_COOKIE_OPTIONS, signSession } from "@/server/access/session";
import { isValidCodeFormat, rateLimit } from "@/server/access/guard";

/**
 * ONE message for every failure.
 *
 * "No such code" and "that isn't six digits" are indistinguishable to the
 * caller on purpose — a distinct malformed-input error would confirm which
 * submissions reached the lookup, turning the endpoint into an oracle for the
 * code format. Rate limiting is the only response that differs, because a
 * client that cannot see it is stuck retrying blind.
 */
const GENERIC_FAILURE = "That code isn't valid.";

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export const Route = createFileRoute("/api/access/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // `xForwardedFor` is on because this runs behind Netlify's proxy, which
        // sets the header. Without it every caller looks like the proxy and the
        // rate limiter degrades to one shared global bucket.
        const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";

        const limit = rateLimit(ip);
        if (!limit.allowed) {
          return json({ ok: false, error: "Too many attempts. Try again later." }, 429, {
            "retry-after": String(limit.retryAfterSeconds),
          });
        }

        let code: unknown;
        try {
          const body: unknown = await request.json();
          code =
            typeof body === "object" && body !== null
              ? (body as Record<string, unknown>)["code"]
              : undefined;
        } catch {
          // Unparseable body is just another invalid submission.
          return json({ ok: false, error: GENERIC_FAILURE }, 401);
        }

        if (!isValidCodeFormat(code)) {
          return json({ ok: false, error: GENERIC_FAILURE }, 401);
        }

        const match = await codeStore.findCode(code);
        if (!match) {
          return json({ ok: false, error: GENERIC_FAILURE }, 401);
        }

        let token: string;
        try {
          token = await signSession({ codeId: match.id, label: match.label });
        } catch (err) {
          // A missing/weak ACCESS_JWT_SECRET is a deployment fault, not a bad
          // code. Say so with a 500 rather than telling the user their valid
          // code was rejected.
          console.error("[access] could not sign session:", err);
          return json({ ok: false, error: "Access is misconfigured. Contact the team." }, 500);
        }

        setCookie(ACCESS_COOKIE_NAME, token, ACCESS_COOKIE_OPTIONS);

        // Audit trail must never turn a successful redemption into a failure.
        try {
          await codeStore.recordRedemption(match.id, ip, request.headers.get("user-agent") ?? "");
        } catch (err) {
          console.error("[access] recordRedemption failed:", err);
        }

        return json({ ok: true }, 200);
      },
    },
  },
});
