/**
 * The access-gate session: a signed HS256 JWT, nothing else.
 *
 * `jose` is used rather than a Node-crypto hand-roll because it runs unchanged
 * on the Web Crypto available in serverless runtimes — the same reason the
 * store uses bcryptjs over native bcrypt.
 *
 * This token proves ONE thing: that a valid invite code was redeemed. It is not
 * a user identity and carries no authorisation beyond "may load the app" —
 * Privy still owns who the user is and what they can sign.
 *
 * SERVER ONLY. Reads ACCESS_JWT_SECRET; never import from client code.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/** Thirty days, in seconds — matches the cookie's Max-Age exactly. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The cookie the gate reads and writes. */
export const ACCESS_COOKIE_NAME = "balcore_access";

export interface AccessSession {
  codeId: string;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Cookie options                                                      */
/* ------------------------------------------------------------------ */

/** The attribute set used when writing `balcore_access`. */
export interface AccessCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/**
 * THE ONE PLACE the access cookie's attributes are defined.
 *
 * `secure` IS DISABLED IN DEVELOPMENT ONLY, and for exactly one reason: over
 * plain http://localhost a browser silently discards a Secure cookie, so the
 * session is issued correctly and then thrown away, and /api/access/verify
 * answers 401 forever. That made the code screen impossible to work on locally.
 *
 * ANY DEPLOYED ENVIRONMENT MUST SET IT. This cookie is the entire access gate —
 * there is nothing else between a visitor and the app. Served without `Secure`
 * over a network, it rides in cleartext on any plain-http request to the domain
 * and anyone who can watch the wire can replay it for the full 30 days. Do not
 * relax the condition below to "staging too" or to a flag someone can flip by
 * mistake; the only environment that may omit it is the one where the cookie
 * cannot leave the machine.
 *
 * Every other attribute is constant across environments: HttpOnly keeps it away
 * from scripts, SameSite=Lax blunts CSRF while surviving the top-level
 * navigation from the marketing site, Path=/ covers the whole app, and Max-Age
 * tracks the JWT's own expiry so the cookie and the token die together.
 */
export function accessCookieOptions(isDev: boolean): AccessCookieOptions {
  return {
    httpOnly: true,
    secure: !isDev,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Vite's own build-time flag — the standard signal, not a custom env var.
 *
 * Read defensively because this module has two very different runtimes. Under
 * Vite (dev server and the nitro build) `import.meta.env.DEV` is replaced with a
 * literal. Under plain `node --test`, which is how `npm test` runs, there is no
 * `import.meta.env` at all and a bare access would throw on import.
 *
 * The fallback direction is deliberate: anything that is not provably
 * development is treated as production, so an unrecognised runtime gets the
 * SECURE cookie rather than the insecure one. A security flag should fail
 * closed.
 */
const IS_DEV: boolean =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true;

/** The options every route uses. Resolved once, from `IS_DEV`. */
export const ACCESS_COOKIE_OPTIONS: AccessCookieOptions = accessCookieOptions(IS_DEV);

/**
 * The signing key.
 *
 * Resolved per call rather than once at module load: a module-level throw would
 * crash the whole server on import when the var is missing, taking down routes
 * that have nothing to do with the gate. Failing here instead keeps the blast
 * radius to the two access endpoints.
 */
function secretKey(secret: string | undefined = process.env["ACCESS_JWT_SECRET"]): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error(
      "ACCESS_JWT_SECRET is missing or shorter than 32 characters — refusing to sign with a weak key",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Sign a 30-day session for a redeemed code. */
export async function signSession(session: AccessSession, secret?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ codeId: session.codeId, label: session.label })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE_SECONDS)
    .sign(secretKey(secret));
}

/**
 * Verify a token. Returns null for EVERY failure mode — bad signature, expired,
 * malformed, wrong algorithm, missing claims — so no caller can accidentally
 * branch on why it failed and leak that to a client.
 *
 * `algorithms` is pinned to HS256 so a token claiming `alg: none` (or any other
 * algorithm) is rejected outright rather than being taken at its word.
 */
export async function verifySession(
  token: string | undefined | null,
  secret?: string,
): Promise<AccessSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ["HS256"],
    });
    return readSession(payload);
  } catch {
    return null;
  }
}

/** Narrow an untrusted payload to our shape, or null. */
function readSession(payload: JWTPayload): AccessSession | null {
  const codeId = payload["codeId"];
  const label = payload["label"];
  if (typeof codeId !== "string" || !codeId) return null;
  if (typeof label !== "string") return null;
  return { codeId, label };
}
