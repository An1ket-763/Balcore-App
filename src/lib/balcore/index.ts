/**
 * Balcore contract integration layer.
 *
 * Import surface for the screens:
 *
 *   import { useVaultStats, useUserPosition } from "@/lib/balcore";
 *
 * Layout mirrors the conventions already in this repo — `src/lib/*` holds the
 * pure chain constants and ABIs (no React/wagmi), and the hooks read through
 * wagmi the way `data/swapBalances.ts` does.
 *
 *   config/   addresses, pool registry, the not-deployed guard
 *   abi/      `as const` fragments GENERATED from the forge artifacts
 *   math.ts   pure ports of the contracts' own formulas
 *   errors.ts selector → user message, for every revert the writes can hit
 *   reads/    view hooks
 *   writes/   stage-machine hooks that move funds, plus the PURE pre-checks
 *
 * The writes follow the stage-machine shape of `data/bridgeBurn.ts` and every
 * one of them dry-runs through `simulateContract` before the wallet opens. The
 * logic that decides whether a button may be pressed lives in `writes/checks.ts`
 * as pure functions, so it is unit-tested rather than trusted.
 */

export {
  BALCORE_CHAIN_ID,
  BALCORE_DEPLOYED,
  BALCORE_POOLS,
  BALCORE_FACTORY,
  BALCORE_SAFE,
  LIVE_POOLS,
  poolByKey,
  poolUnavailableReason,
  type BalcorePool,
  type PoolKey,
  type PoolStatus,
} from "./config/addresses";

export { balcoreBankAbi } from "./abi/bank";
export { balcoreVaultAbi } from "./abi/vault";
export { balcoreSequencerAbi } from "./abi/sequencer";
export { lbPairAbi } from "./abi/pair";

export {
  LB_REFERENCE_BIN,
  FEE_DIAL_KEYS,
  binToPrice,
  priceToBin,
  feeDialLane,
  matchedAmount,
  ratioOk,
  positionValue,
  holderTVL,
  nextTuesday00Z,
  type FeeDialKey,
} from "./math";

export {
  useVaultStats,
  type VaultStats,
  type VaultRange,
  type UseVaultStatsResult,
} from "./reads/useVaultStats";

export {
  useUserPosition,
  type UserPosition,
  type UseUserPositionResult,
  type WithdrawBasketView,
  type WithdrawPreview,
  type WithdrawRequestView,
} from "./reads/useUserPosition";

export {
  useFastTrackAvailability,
  FAST_TRACK_DAILY_CAP_BPS,
  FAST_TRACK_FEE_BPS,
  type FastTrackAvailability,
  type UseFastTrackAvailabilityResult,
} from "./reads/useFastTrackAvailability";

/* ---- errors ---- */

export {
  decodeBalcoreError,
  balcoreErrorMessage,
  walletMessage,
  knownErrorSelectors,
  erc20ErrorAbi,
  type DecodedBalcoreError,
  type WriteContext,
} from "./errors";

/* ---- writes ---- */

export {
  // Pure pre-checks and previews — exported because the panels render their
  // messages directly and the tests import them without a DOM.
  checkDeposit,
  checkRequestWithdraw,
  checkExecuteWithdraw,
  checkCancelWithdraw,
  checkClaimYield,
  checkFastTrack,
  valueDeposit,
  splitUsdcForDeposit,
  minTokenAForPairing,
  previewFastTrack,
  withdrawStatus,
  secondsUntilReady,
  formatCountdown,
  summarise,
  CANCEL_CONSEQUENCE,
  DRIFT_WARN_BPS,
  type CheckIssue,
  type CheckResult,
  type DepositMode,
  type DepositCheckInput,
  type DepositValuation,
  type UsdcSplit,
  type WithdrawStatus,
  type FastTrackPreview,
} from "./writes/checks";

export {
  planDepositStages,
  nextStage,
  isBusyStage,
  useBalcoreNetwork,
  useAllowances,
  INSPECT_ONLY_ERROR,
  type WriteStage,
  type WriteMachine,
  type DryRunResult,
  type InspectOptions,
} from "./writes/shared";

export { useDeposit, type DepositHook, type DepositInput } from "./writes/useDeposit";
export { useWithdraw, type WithdrawHook } from "./writes/useWithdraw";
export { useClaimYield, type ClaimYieldHook } from "./writes/useClaimYield";
export { useFastTrack, NO_IL_COVER_WARNING, type FastTrackHook } from "./writes/useFastTrack";
