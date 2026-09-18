/**
 * GET /api/access/verify — is the caller's access cookie still good?
 *
 * Same server-route form as redeem.ts: `server.handlers.GET` on a file route.
 *
 * Read-only and side-effect free. It does NOT refresh the cookie: a sliding
 * window would let one redeemed code keep itself alive indefinitely without
 * ever being re-checked against the store, which is the opposite of what a
 * revocable invite gate wants.
 */

import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import { ACCESS_COOKIE_NAME, verifySession } from "@/server/access/session";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Never let a proxy or the browser cache an auth answer.
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/access/verify")({
  server: {
    handlers: {
      GET: async () => {
        const token = getCookie(ACCESS_COOKIE_NAME);
        const session = await verifySession(token);
        if (!session) return json({ ok: false }, 401);
        return json({ ok: true, label: session.label }, 200);
      },
    },
  },
});
