#!/usr/bin/env node
/**
 * Mint one invite code.
 *
 *   node scripts/make-access-code.mjs "Acme Capital"
 *
 * Prints the 6-digit code to hand out, and the `id:label:bcryptHash` line to
 * append to ACCESS_CODE_HASHES. The plaintext code is shown ONCE and never
 * stored — only the bcrypt hash goes into the env var, so a leaked env dump
 * does not hand over working codes.
 */

import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";

/** bcrypt work factor. 10 is ~50-100ms per compare on serverless hardware. */
const BCRYPT_ROUNDS = 10;

const label = process.argv.slice(2).join(" ").trim();
if (!label) {
  console.error('Usage: node scripts/make-access-code.mjs "<label>"');
  console.error('   eg: node scripts/make-access-code.mjs "Acme Capital"');
  process.exit(1);
}

// A label containing a comma or colon would corrupt the env var's own
// delimiters and silently shift every field of this entry when parsed.
if (label.includes(",") || label.includes(":")) {
  console.error("Label must not contain a comma or a colon — they delimit ACCESS_CODE_HASHES.");
  process.exit(1);
}

/**
 * `randomInt` is the CSPRNG, and the range is expressed so every one of the
 * million values is equally likely — including those with leading zeros, which
 * `padStart` preserves. `Math.random()` would be both biased and predictable.
 */
const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Short, URL-safe, and unique enough to tell two entries apart in a log. */
const id = `c_${randomInt(0, 1_000_000_000).toString(36)}`;

const bcryptHash = await hash(code, BCRYPT_ROUNDS);

console.log("");
console.log(`  label : ${label}`);
console.log(`  code  : ${code}      <- give this to the invitee; it is not stored anywhere`);
console.log("");
console.log("  Append to ACCESS_CODE_HASHES (comma-separated, no spaces around the comma):");
console.log("");
console.log(`${id}:${label}:${bcryptHash}`);
console.log("");
