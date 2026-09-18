/**
 * Invite-code lookup, behind one narrow interface.
 *
 * The interface is deliberately tiny and storage-agnostic so a MySQL-backed
 * store can replace `EnvCodeStore` without a single caller changing: the routes
 * only ever see `findCode` and `recordRedemption`.
 *
 * SERVER ONLY. This module reads process.env and runs bcrypt; it must never be
 * imported from a route component or anything that reaches the client bundle.
 */

import { compare } from "bcryptjs";

export interface AccessCode {
  id: string;
  label: string;
}

export interface CodeStore {
  /** The code that was submitted, or null when nothing matches. */
  findCode(code: string): Promise<AccessCode | null>;
  /** Fire-and-forget audit trail. Must never throw into the request path. */
  recordRedemption(codeId: string, ip: string, userAgent: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Env-backed store                                                    */
/* ------------------------------------------------------------------ */

interface ParsedEntry {
  id: string;
  label: string;
  hash: string;
}

/**
 * Parse ACCESS_CODE_HASHES: `id:label:bcryptHash` entries, comma-separated.
 *
 * Split on the FIRST TWO colons only. A bcrypt hash is `$2b$10$...` and can
 * itself contain characters a naive `split(":")` would survive, but the label is
 * author-supplied and a colon in it would silently shift every field — so id and
 * label are taken positionally and the entire remainder is the hash.
 *
 * A malformed entry is skipped rather than throwing: one bad paste in an env var
 * should not take down every other code with it.
 */
function parseEntries(raw: string | undefined): ParsedEntry[] {
  if (!raw) return [];
  const out: ParsedEntry[] = [];
  for (const chunk of raw.split(",")) {
    const entry = chunk.trim();
    if (!entry) continue;
    const firstColon = entry.indexOf(":");
    if (firstColon <= 0) continue;
    const secondColon = entry.indexOf(":", firstColon + 1);
    if (secondColon <= firstColon + 1) continue;
    const id = entry.slice(0, firstColon).trim();
    const label = entry.slice(firstColon + 1, secondColon).trim();
    const hash = entry.slice(secondColon + 1).trim();
    if (!id || !label || !hash) continue;
    out.push({ id, label, hash });
  }
  return out;
}

export class EnvCodeStore implements CodeStore {
  private readonly entries: ParsedEntry[];

  /** `raw` defaults to the env var; injectable so tests need no process.env. */
  constructor(raw: string | undefined = process.env["ACCESS_CODE_HASHES"]) {
    this.entries = parseEntries(raw);
  }

  /** How many usable entries were parsed — for a startup sanity log. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Compare against EVERY entry, without an early exit on the first match.
   *
   * bcrypt is intentionally slow, so a loop that returns as soon as it matches
   * leaks position: a code held in the first entry answers measurably faster
   * than one in the twentieth. The loop below always runs to the end and keeps
   * the first hit, so the work done is the same whichever code was submitted —
   * and the same again when none match.
   */
  async findCode(code: string): Promise<AccessCode | null> {
    let found: AccessCode | null = null;
    for (const entry of this.entries) {
      let ok = false;
      try {
        ok = await compare(code, entry.hash);
      } catch {
        // A corrupt hash in the env var must not 500 the request; treat it as
        // a non-match and keep checking the rest.
        ok = false;
      }
      if (ok && found === null) found = { id: entry.id, label: entry.label };
    }
    return found;
  }

  /**
   * No-op beyond a log line. A real store writes a row here; the signature is
   * already the one a MySQL implementation needs, so swapping it in is a
   * constructor change at the call site and nothing else.
   */
  async recordRedemption(codeId: string, ip: string, userAgent: string): Promise<void> {
    console.info(
      `[access] redeemed code=${codeId} ip=${ip || "unknown"} ua=${(userAgent || "unknown").slice(0, 120)}`,
    );
  }
}

/** The store the routes use. One instance per server process. */
export const codeStore: CodeStore = new EnvCodeStore();
