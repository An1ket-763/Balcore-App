/**
 * The access gate's DECISION, as pure functions.
 *
 * CLIENT-SAFE ON PURPOSE. This module is imported by `__root.tsx`, which is
 * part of the client bundle, so it must never reach for `jose`, the JWT secret,
 * or anything under `src/server/access/`. It decides *whether to check* and
 * *what to do with the answer*; the checking itself is injected, and in the app
 * that injection is a `createServerFn` whose body the bundler strips out of the
 * client.
 *
 * Split out this way for one more reason: the decision is then testable under
 * plain `node --test` with a fake verifier, with no server, no cookie jar and
 * no secret in the test's import graph.
 */

/** Where an unauthenticated visitor is sent. */
export const ACCESS_ROUTE = "/access";

/** The search param carrying the path to restore after a successful code. */
export const NEXT_PARAM = "next";

/**
 * Paths that are never gated.
 *
 * `/access` itself, or the gate would redirect to itself forever, and `/api/`
 * because the redeem and verify endpoints must stay reachable to a visitor who
 * has no session yet — that is the entire point of them.
 *
 * Matched as a whole segment: `/access` and `/access/anything` are public,
 * `/accessible` is NOT. A `startsWith("/access")` would have quietly opened
 * every path that merely begins with those seven characters.
 */
export function isPublicAccessPath(pathname: string): boolean {
  if (pathname === ACCESS_ROUTE || pathname.startsWith(`${ACCESS_ROUTE}/`)) return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  return false;
}

export type AccessDecision =
  { readonly allow: true } | { readonly allow: false; readonly next: string };

/**
 * Should this navigation proceed?
 *
 * `verify` is called ONLY for gated paths, so a visitor landing on the code
 * screen costs no round-trip.
 *
 * A verifier that throws is treated as a denial, not as an allow. A network
 * blip or a misconfigured secret must not become an open door — the gate fails
 * closed, the same way the cookie's `secure` flag does.
 */
export async function decideAccess(
  pathname: string,
  href: string,
  verify: () => Promise<boolean>,
): Promise<AccessDecision> {
  if (isPublicAccessPath(pathname)) return { allow: true };

  let ok = false;
  try {
    ok = await verify();
  } catch {
    ok = false;
  }

  if (ok) return { allow: true };
  return { allow: false, next: nextParamFor(href) };
}

/**
 * Normalise what we hand back as `?next=`.
 *
 * Only a same-origin, root-relative path survives. An absolute URL or a
 * protocol-relative `//evil.example` would turn the code screen into an open
 * redirect: enter a valid code, get bounced off-site. Anything that is not a
 * plain `/path` collapses to `/`.
 */
export function nextParamFor(href: string): string {
  if (!href.startsWith("/")) return "/";
  // `//host` and `/\host` are both read as protocol-relative by browsers.
  if (href.startsWith("//") || href.startsWith("/\\")) return "/";
  return href;
}

/**
 * Where to send the visitor after a successful code, given `?next=`.
 *
 * Re-validated here rather than trusted from the URL: the value has been
 * through the browser's address bar since we wrote it, and a hand-edited
 * `?next=https://evil.example` must not be followed.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next === "") return "/";
  const path = nextParamFor(next);
  // Never bounce straight back to the code screen.
  return isPublicAccessPath(path) ? "/" : path;
}
