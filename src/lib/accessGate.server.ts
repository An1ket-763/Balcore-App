/**
 * The server half of the gate's check, behind a `createServerFn` boundary.
 *
 * WHY THIS FILE EXISTS AT ALL. `__root.tsx`'s `beforeLoad` runs in two places:
 * on the server during SSR, and in the browser on every client-side navigation.
 * Importing `src/server/access/session.ts` into it directly would therefore drag
 * `jose` and the JWT-secret logic into the client bundle, where the secret is
 * read from an env var that does not exist and the verification could be
 * short-circuited by anyone with devtools.
 *
 * `createServerFn` is the framework's own answer to that: the compiler replaces
 * the handler with an RPC stub on the client, so the body below — and
 * everything it imports — never ships. During SSR the handler runs in-process,
 * which is what makes the check happen BEFORE any app markup is produced.
 *
 * The import of `session.ts` is read-only; nothing under `src/server/access/`
 * is modified.
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { ACCESS_COOKIE_NAME, verifySession } from "@/server/access/session";

/**
 * Does the caller hold a valid session cookie?
 *
 * Returns a plain boolean rather than the session: `beforeLoad` only needs the
 * yes/no, and sending the label back over the RPC would put it in the SSR
 * payload for no reason.
 *
 * GET because it is a pure read — that also lets the framework treat it as
 * cacheable-shaped, though nothing here caches it.
 */
export const verifyAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    const token = getCookie(ACCESS_COOKIE_NAME);
    const session = await verifySession(token);
    return session !== null;
  },
);
