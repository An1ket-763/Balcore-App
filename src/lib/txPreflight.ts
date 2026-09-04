/**
 * Shared dry-run classification for transactions that spend money.
 *
 * Both the swap and the bridge simulate a call against the chain before opening
 * the wallet. The rule they share is the important part, and it is easy to get
 * backwards: only a genuine REVERT may block the user. A timeout, a rate-limited
 * node or a dead RPC must fall through and let the wallet do its own estimate —
 * otherwise a flaky network looks to the user like a broken app.
 *
 * Message wording stays with each feature, since "raise your slippage" and
 * "approve again" are not interchangeable advice.
 */

import { BaseError, ContractFunctionRevertedError, ExecutionRevertedError } from "viem";

/** A transaction the chain rejected before it ever reached the wallet. */
export class PreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreflightError";
  }
}

/**
 * Did the chain reject this call, or did we simply fail to ask it?
 *
 * viem wraps the real cause several layers deep, so the typed errors are walked
 * first; the message check is a fallback for nodes that report a revert without
 * the structured payload.
 */
export function isRevert(err: unknown): boolean {
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError || e instanceof ExecutionRevertedError,
    );
    if (reverted) return true;
  }
  const msg = err instanceof Error ? err.message : "";
  return /execution reverted|reverted with|InsufficientAmountOut|Too little received|TRANSFER_FROM_FAILED|STF|insufficient allowance|transfer amount exceeds/i.test(
    msg,
  );
}

/** The revert reason viem recovered, when it recovered one. */
export function revertName(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  return reverted.data?.errorName ?? reverted.reason ?? null;
}
