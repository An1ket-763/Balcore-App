/**
 * The stage machine, as pure data.
 *
 * Split out of `shared.ts` for one reason: `shared.ts` imports React and wagmi,
 * and this repo's test runner is `node --test` with no DOM and no bundler, so
 * anything in that file is untestable. The stage PLAN is behaviour worth pinning
 * — "skips approvals that already suffice" is a promise to the user, not an
 * implementation detail — so it lives here, where a test can reach it.
 *
 * `shared.ts` re-exports everything below, so callers see one surface.
 */

/* ------------------------------------------------------------------ */
/* Stages                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every stage any Balcore write can be in.
 *
 * One union across all four hooks rather than one per hook: the panels share a
 * progress component, and a stage that means the same thing should be spelled
 * the same way. `preparing` is the dry run, `signing` is the wallet being open,
 * `confirming` is waiting for the receipt.
 */
export type WriteStage =
  | "idle"
  /** usdcOnly deposits only: selling half the USDC for tokenA first. */
  | "swapping"
  | "approvingTokenA"
  | "approvingUsdc"
  | "preparing"
  | "signing"
  | "confirming"
  | "done"
  | "error";

/** Stages during which no new action may be started. */
const BUSY_STAGES: ReadonlySet<WriteStage> = new Set<WriteStage>([
  "swapping",
  "approvingTokenA",
  "approvingUsdc",
  "preparing",
  "signing",
  "confirming",
]);

export function isBusyStage(stage: WriteStage): boolean {
  return BUSY_STAGES.has(stage);
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

export interface DepositStagePlanInput {
  mode: "both" | "usdcOnly";
  tokenAAmount: bigint;
  usdcAmount: bigint;
  /** Current allowance of tokenA to the BANK. */
  tokenAAllowance: bigint;
  /** Current allowance of USDC to the BANK. */
  usdcAllowance: bigint;
  /** usdcOnly: allowance of USDC to the chosen swap router. */
  swapAllowance?: bigint;
  /** usdcOnly: USDC that will be sold for tokenA. */
  swapUsdc?: bigint;
}

/**
 * The ordered stages a given deposit actually needs.
 *
 * Approvals that already suffice are SKIPPED rather than re-sent: an allowance
 * at or above the amount needs no transaction, and asking for one anyway costs
 * the user a signature and a fee for nothing.
 *
 * APPROVAL TARGET, stated once because it is the easiest thing to get wrong:
 * both tokens are approved to the **BANK**, not to the vault and not to the
 * sequencer. `BalCoreBank.deposit` is what calls `safeTransferFrom`
 * (BalCoreBank.sol:534-535); it then forwards both legs to the trader itself.
 *
 * THE SWAP'S APPROVAL IS A DIFFERENT SPENDER. In `usdcOnly` the router needs
 * its own allowance on USDC, so a user who has already approved the bank still
 * needs one more approval — and it comes FIRST, because the swap has to happen
 * before the deposit legs are known.
 */
export function planDepositStages(input: DepositStagePlanInput): WriteStage[] {
  const stages: WriteStage[] = [];

  if (input.mode === "usdcOnly") {
    const swapUsdc = input.swapUsdc ?? 0n;
    if (swapUsdc > 0n) {
      if ((input.swapAllowance ?? 0n) < swapUsdc) stages.push("approvingUsdc");
      stages.push("swapping");
    }
  }

  if (input.tokenAAmount > 0n && input.tokenAAllowance < input.tokenAAmount) {
    stages.push("approvingTokenA");
  }
  if (input.usdcAmount > 0n && input.usdcAllowance < input.usdcAmount) {
    stages.push("approvingUsdc");
  }

  stages.push("preparing", "signing", "confirming", "done");
  return stages;
}

/** The stage to enter next, or null when the plan is complete. */
export function nextStage(plan: readonly WriteStage[], current: WriteStage): WriteStage | null {
  const at = plan.indexOf(current);
  if (at < 0) return plan[0] ?? null;
  return plan[at + 1] ?? null;
}
