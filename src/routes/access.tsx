/**
 * The code screen — the only thing an unauthenticated visitor can reach.
 *
 * Styling reuses the tokens `__root.tsx`'s own 404 and error screens already
 * use (`bg-background`, `text-foreground`, `text-muted-foreground`, the same
 * centred `flex min-h-screen items-center justify-center px-4` shell). No new
 * colours and no second design idiom; the shadcn `InputOTP` already in
 * `src/components/ui` supplies the input.
 *
 * Deliberately thin on copy: a heading, one line explaining the gate, the
 * input. No signup, no request-access form, no marketing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { NEXT_PARAM, safeNextPath } from "@/lib/accessGate";

/** Seconds the input stays locked after the server rate-limits us. */
const LOCKOUT_SECONDS = 60;

const CODE_LENGTH = 6;

interface AccessSearch {
  [NEXT_PARAM]?: string;
}

export const Route = createFileRoute("/access")({
  /**
   * `next` is read back off the URL, so it is re-validated on use rather than
   * trusted — see `safeNextPath`. Kept as a plain string here; the sanitising
   * happens at the point of navigation.
   */
  validateSearch: (search: Record<string, unknown>): AccessSearch => {
    const next = search[NEXT_PARAM];
    return typeof next === "string" && next !== "" ? { [NEXT_PARAM]: next } : {};
  },
  head: () => ({
    meta: [
      { title: "BalCore — Invite only" },
      // A gate screen has nothing to index and no preview worth sharing.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccessScreen,
});

function AccessScreen() {
  const search = Route.useSearch();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);

  /**
   * Guards against a second submit for the same six digits.
   *
   * `pending` alone is not enough: `InputOTP` can fire onChange again in the
   * same tick the request starts, and React state has not updated yet. A ref
   * flips synchronously.
   */
  const inFlight = useRef(false);

  /** Countdown while rate-limited. */
  useEffect(() => {
    if (lockedFor <= 0) return;
    const id = setInterval(() => setLockedFor((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockedFor]);

  const submit = useCallback(
    async (value: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError(null);

      try {
        const res = await fetch("/api/access/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // The whole point is the Set-Cookie coming back. Same-origin would
          // cover it, but state it outright so a future move to another origin
          // fails loudly rather than silently dropping the session.
          credentials: "include",
          body: JSON.stringify({ code: value }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };

        if (res.ok && body.ok) {
          // Full document load, not a client-side navigate: the router's
          // beforeLoad has already cached a "denied" decision for this visit,
          // and the app shell behind the gate expects a fresh SSR pass.
          window.location.assign(safeNextPath(search[NEXT_PARAM]));
          return;
        }

        if (res.status === 429) {
          setError(body.error ?? "Too many attempts. Try again later.");
          setLockedFor(LOCKOUT_SECONDS);
          setCode("");
          return;
        }

        // Every other failure is the server's single generic message.
        setError(body.error ?? "That code isn't valid.");
        setCode("");
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
        setCode("");
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [search],
  );

  const onChange = useCallback(
    (value: string) => {
      if (pending || lockedFor > 0) return;
      setCode(value);
      if (error) setError(null);
      if (value.length === CODE_LENGTH) void submit(value);
    },
    [pending, lockedFor, error, submit],
  );

  const disabled = pending || lockedFor > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">BalCore</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access is currently invite-only. Enter your 6-digit code.
        </p>

        <div className="mt-8 flex justify-center">
          <InputOTP
            maxLength={CODE_LENGTH}
            value={code}
            onChange={onChange}
            disabled={disabled}
            autoFocus
            // Numeric only, and the right keyboard on a phone.
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="6-digit access code"
            aria-invalid={error !== null}
            aria-describedby={error ? "access-error" : undefined}
          >
            <InputOTPGroup>
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/*
          One live region for all three states, so a screen reader announces
          whichever is current instead of the messages competing.
        */}
        <div className="mt-4 min-h-5 text-sm" aria-live="polite">
          {pending ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : lockedFor > 0 ? (
            <span id="access-error" className="text-destructive">
              {error} Try again in {lockedFor}s.
            </span>
          ) : error ? (
            <span id="access-error" className="text-destructive">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
