/**
 * Unit tests for the access gate's pure and near-pure parts.
 *
 * Runner: Node's built-in `node:test` with `--experimental-strip-types`
 * (`npm run test`) — the same zero-dependency setup `src/lib/balcore/*.test.ts`
 * uses. No DOM, no server, no network.
 *
 * The secret is passed explicitly to signSession/verifySession rather than set
 * on process.env, so these cases cannot leak into one another and cannot be
 * affected by whatever the developer has in their shell.
 */

import { strict as assert } from "node:assert";
import test, { describe } from "node:test";
import { SignJWT } from "jose";

import { signSession, verifySession, SESSION_MAX_AGE_SECONDS } from "./session.ts";
import {
  isValidCodeFormat,
  rateLimit,
  resetRateLimit,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
} from "./guard.ts";
import { EnvCodeStore } from "./codeStore.ts";

/** 32+ chars, which is the floor `secretKey()` enforces. */
const SECRET = "test-secret-that-is-long-enough-32ch";
const OTHER_SECRET = "a-different-secret-also-long-enough-32";

describe("session sign + verify", () => {
  test("round-trips the payload", async () => {
    const token = await signSession({ codeId: "c_1", label: "Acme" }, SECRET);
    const session = await verifySession(token, SECRET);
    assert.deepEqual(session, { codeId: "c_1", label: "Acme" });
  });

  test("issues a 30-day expiry", async () => {
    const token = await signSession({ codeId: "c_1", label: "Acme" }, SECRET);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { iat: number; exp: number };
    assert.equal(claims.exp - claims.iat, SESSION_MAX_AGE_SECONDS);
  });

  test("a tampered payload fails verification", async () => {
    const token = await signSession({ codeId: "c_1", label: "Acme" }, SECRET);
    const [header, payload, signature] = token.split(".");
    // Re-encode the payload with a different codeId, keeping the signature.
    const decoded = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    decoded["codeId"] = "c_attacker";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    assert.equal(await verifySession(`${header}.${forged}.${signature}`, SECRET), null);
  });

  test("a token signed with another secret fails verification", async () => {
    const token = await signSession({ codeId: "c_1", label: "Acme" }, OTHER_SECRET);
    assert.equal(await verifySession(token, SECRET), null);
  });

  test("an expired token fails verification", async () => {
    const past = Math.floor(Date.now() / 1000) - 60 * 60;
    const expired = await new SignJWT({ codeId: "c_1", label: "Acme" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(past - 10)
      .setExpirationTime(past) // already elapsed
      .sign(new TextEncoder().encode(SECRET));
    assert.equal(await verifySession(expired, SECRET), null);
  });

  test("an `alg: none` token is refused", async () => {
    // Hand-built unsigned token — jose will not produce one of these.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ codeId: "c_1", label: "Acme", exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");
    assert.equal(await verifySession(`${header}.${payload}.`, SECRET), null);
  });

  test("garbage and empty input fail rather than throw", async () => {
    assert.equal(await verifySession("not-a-jwt", SECRET), null);
    assert.equal(await verifySession("", SECRET), null);
    assert.equal(await verifySession(undefined, SECRET), null);
    assert.equal(await verifySession(null, SECRET), null);
  });

  test("signing refuses a weak secret", async () => {
    await assert.rejects(() => signSession({ codeId: "c_1", label: "Acme" }, "too-short"));
  });
});

describe("code format validation", () => {
  test("accepts exactly six digits, including leading zeros", () => {
    assert.equal(isValidCodeFormat("123456"), true);
    assert.equal(isValidCodeFormat("000000"), true);
    assert.equal(isValidCodeFormat("007007"), true);
  });

  test("rejects five digits", () => {
    assert.equal(isValidCodeFormat("12345"), false);
  });

  test("rejects seven digits", () => {
    assert.equal(isValidCodeFormat("1234567"), false);
  });

  test("rejects non-digits", () => {
    for (const bad of [
      "12345a",
      "abcdef",
      "12 456",
      "12-456",
      "１２３４５６",
      "١٢٣٤٥٦",
      "12.456",
    ]) {
      assert.equal(isValidCodeFormat(bad), false, `expected ${bad} to be rejected`);
    }
  });

  test("rejects whitespace padding rather than trimming it", () => {
    assert.equal(isValidCodeFormat(" 123456"), false);
    assert.equal(isValidCodeFormat("123456 "), false);
    assert.equal(isValidCodeFormat("123456\n"), false);
  });

  test("rejects non-strings", () => {
    for (const bad of [123456, null, undefined, {}, [], true]) {
      assert.equal(isValidCodeFormat(bad), false);
    }
  });
});

describe("rate limit", () => {
  test("allows exactly the configured attempts, then blocks", () => {
    resetRateLimit();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
      assert.equal(rateLimit("1.1.1.1").allowed, true, `attempt ${i + 1} should be allowed`);
    }
    assert.equal(rateLimit("1.1.1.1").allowed, false);
  });

  test("tracks each IP separately", () => {
    resetRateLimit();
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) rateLimit("2.2.2.2");
    assert.equal(rateLimit("2.2.2.2").allowed, false);
    assert.equal(rateLimit("3.3.3.3").allowed, true);
  });

  test("resets once the window has passed", () => {
    resetRateLimit();
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) rateLimit("4.4.4.4", t0);
    assert.equal(rateLimit("4.4.4.4", t0).allowed, false);
    assert.equal(rateLimit("4.4.4.4", t0 + RATE_LIMIT_WINDOW_MS).allowed, true);
  });

  test("a blocked key does not slide its own window forward", () => {
    resetRateLimit();
    const t0 = 2_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS + 3; i++) rateLimit("5.5.5.5", t0 + i);
    // Still inside the original window, so still blocked.
    assert.equal(rateLimit("5.5.5.5", t0 + RATE_LIMIT_WINDOW_MS - 1).allowed, false);
  });
});

describe("EnvCodeStore parsing", () => {
  /**
   * A REAL bcrypt hash of "424242" at cost 4 (low, to keep the suite fast).
   *
   * Generated with bcryptjs and checked to compare true — an invented
   * hash-shaped string would make every negative case below pass for the wrong
   * reason, since a non-match and a corrupt hash are both "null" here.
   * `matches the right code` is what keeps this constant honest.
   */
  const HASH_424242 = "$2b$04$gSPRPOOYMXggjg35RQvXqupqOjNYHvhu8dL2Cl7fhdIre0l8FHPU6";

  test("matches the right code and returns its id and label", async () => {
    const store = new EnvCodeStore(`c_1:Acme Capital:${HASH_424242}`);
    assert.deepEqual(await store.findCode("424242"), { id: "c_1", label: "Acme Capital" });
  });

  test("picks the matching entry out of several", async () => {
    const other = "$2b$04$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"; // hash of "a"
    const store = new EnvCodeStore(
      [`c_0:First:${other}`, `c_1:Acme Capital:${HASH_424242}`, `c_2:Third:${other}`].join(","),
    );
    assert.equal(store.size, 3);
    assert.deepEqual(await store.findCode("424242"), { id: "c_1", label: "Acme Capital" });
  });

  test("an empty or missing env var yields no codes", async () => {
    assert.equal(new EnvCodeStore(undefined).size, 0);
    assert.equal(new EnvCodeStore("").size, 0);
    assert.equal(await new EnvCodeStore(undefined).findCode("123456"), null);
  });

  test("malformed entries are skipped, not fatal", () => {
    const store = new EnvCodeStore(
      ["no-colons-at-all", "onlyone:colon", ":empty-id:hash", `good:Acme:${HASH_424242}`].join(","),
    );
    assert.equal(store.size, 1);
  });

  test("a label is taken positionally so a hash's own $ and / survive", () => {
    const store = new EnvCodeStore(`c_1:Acme Capital:${HASH_424242}`);
    assert.equal(store.size, 1);
  });

  test("returns null when nothing matches", async () => {
    const store = new EnvCodeStore(`c_1:Acme:${HASH_424242}`);
    assert.equal(await store.findCode("999999"), null);
  });

  test("a corrupt hash is a non-match rather than a throw", async () => {
    const store = new EnvCodeStore("c_1:Acme:not-a-bcrypt-hash");
    assert.equal(await store.findCode("424242"), null);
  });
});
