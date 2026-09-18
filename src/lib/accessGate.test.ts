/**
 * Tests for the access gate's allow/deny decision.
 *
 * Runner: `node:test` with `--experimental-strip-types`, matching
 * `src/server/access/access.test.ts` and `src/lib/balcore/*.test.ts`.
 *
 * The verifier is injected, so nothing here imports `jose`, the JWT secret or
 * anything under `src/server/access/` — which is also the property that lets
 * this run under plain node at all.
 */

import { strict as assert } from "node:assert";
import test, { describe } from "node:test";

import {
  ACCESS_ROUTE,
  decideAccess,
  isPublicAccessPath,
  nextParamFor,
  safeNextPath,
} from "./accessGate.ts";

/** A verifier that must never be consulted for a public path. */
function verifierThatMustNotRun(): () => Promise<boolean> {
  return () => {
    throw new Error("verify() should not be called for a public path");
  };
}

const allows = () => Promise.resolve(true);
const denies = () => Promise.resolve(false);

describe("isPublicAccessPath", () => {
  test("the code screen itself is public", () => {
    assert.equal(isPublicAccessPath("/access"), true);
    assert.equal(isPublicAccessPath("/access/"), true);
  });

  test("api paths are public", () => {
    assert.equal(isPublicAccessPath("/api/access/redeem"), true);
    assert.equal(isPublicAccessPath("/api/access/verify"), true);
    assert.equal(isPublicAccessPath("/api/anything/else"), true);
  });

  test("a path that merely starts with the same letters is NOT public", () => {
    // The bug a naive startsWith("/access") would have introduced.
    assert.equal(isPublicAccessPath("/accessible"), false);
    assert.equal(isPublicAccessPath("/access-denied"), false);
    assert.equal(isPublicAccessPath("/apiary"), false);
  });

  test("ordinary app paths are gated", () => {
    for (const p of ["/", "/explorer", "/dev/balcore", "/anything"]) {
      assert.equal(isPublicAccessPath(p), false, `${p} should be gated`);
    }
  });
});

describe("decideAccess", () => {
  test("/access is allowed with no cookie, without even checking", async () => {
    const decision = await decideAccess("/access", "/access", verifierThatMustNotRun());
    assert.deepEqual(decision, { allow: true });
  });

  test("/api/ paths are allowed without checking", async () => {
    const decision = await decideAccess(
      "/api/access/redeem",
      "/api/access/redeem",
      verifierThatMustNotRun(),
    );
    assert.deepEqual(decision, { allow: true });
  });

  test("an arbitrary path with no valid cookie is denied", async () => {
    const decision = await decideAccess("/explorer", "/explorer", denies);
    assert.deepEqual(decision, { allow: false, next: "/explorer" });
  });

  test("an arbitrary path with a valid cookie is allowed", async () => {
    const decision = await decideAccess("/explorer", "/explorer", allows);
    assert.deepEqual(decision, { allow: true });
  });

  test("the denial carries the full original href, query included", async () => {
    const decision = await decideAccess("/explorer", "/explorer?tab=fees&x=1", denies);
    assert.deepEqual(decision, { allow: false, next: "/explorer?tab=fees&x=1" });
  });

  test("a verifier that throws denies rather than allows", async () => {
    const decision = await decideAccess("/", "/", () => Promise.reject(new Error("network")));
    assert.deepEqual(decision, { allow: false, next: "/" });
  });

  test("the root path is gated like any other", async () => {
    assert.deepEqual(await decideAccess("/", "/", denies), { allow: false, next: "/" });
    assert.deepEqual(await decideAccess("/", "/", allows), { allow: true });
  });
});

describe("open-redirect protection", () => {
  test("nextParamFor keeps a root-relative path", () => {
    assert.equal(nextParamFor("/explorer?tab=fees"), "/explorer?tab=fees");
  });

  test("nextParamFor rejects absolute and protocol-relative URLs", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil"]) {
      assert.equal(nextParamFor(bad), "/", `${bad} should collapse to /`);
    }
  });

  test("safeNextPath refuses anything that would leave the origin", async () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example"]) {
      assert.equal(safeNextPath(bad), "/");
    }
  });

  test("safeNextPath refuses to bounce back to the code screen", () => {
    assert.equal(safeNextPath(ACCESS_ROUTE), "/");
    assert.equal(safeNextPath("/api/access/verify"), "/");
  });

  test("safeNextPath falls back to / for missing or non-string input", () => {
    for (const bad of [undefined, null, "", 42, {}, []]) {
      assert.equal(safeNextPath(bad), "/");
    }
  });

  test("safeNextPath passes a legitimate path through", () => {
    assert.equal(safeNextPath("/explorer?tab=fees"), "/explorer?tab=fees");
  });
});
