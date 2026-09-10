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
 *   reads/    view hooks
 *
 * Nothing in here can move funds: this commit is config, ABI, math and reads.
 * The write hooks (deposit / requestWithdraw / fastTrack) land separately and
 * should follow the stage-machine shape of `data/bridgeBurn.ts`.
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
