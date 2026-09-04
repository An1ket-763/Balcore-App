import { useQuery } from "@tanstack/react-query";
import { bpsForSpeed, fetchBurnFees, type BurnFees } from "@/lib/cctpApi";
import { feeFromBps, type BridgeChain, type TransferSpeed } from "@/lib/cctp";

/**
 * What Circle currently charges to bridge this route.
 *
 * Fees are per-route and Circle asks that they be read before every transfer
 * rather than hardcoded — they range 0-14 bps depending on the source chain and
 * can change. The old panel carried a fixed table that claimed 1 bp everywhere.
 */
export interface BridgeFee {
  /** Basis points for the selected speed; null when Circle has not quoted. */
  bps: number | null;
  /** The fee itself, in USDC's smallest unit, for the entered amount. */
  feeWei: bigint | null;
  /** What actually arrives: the fee is deducted at mint time. */
  receiveWei: bigint | null;
  isLoading: boolean;
  isError: boolean;
  /**
   * True when a Fast transfer cannot be priced. The burn's `maxFee` is derived
   * from the quote, so sending without one either reverts (ceiling too low) or
   * authorises an unbounded fee. Blocking is the only safe option.
   */
  blocksFast: boolean;
}

export function useBridgeFee(
  source: BridgeChain | null,
  destination: BridgeChain | null,
  speed: TransferSpeed,
  amountWei: bigint,
): BridgeFee {
  const enabled = Boolean(source && destination && source.domain !== destination.domain);

  const query = useQuery<BurnFees>({
    queryKey: ["cctp-burn-fees", source?.domain, destination?.domain],
    queryFn: ({ signal }) => fetchBurnFees(source!.domain, destination!.domain, signal),
    enabled,
    // Circle's fees move slowly, but "before every transfer" is the guidance.
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
    retry: 1,
  });

  const bps = bpsForSpeed(query.data, speed);
  const feeWei = amountWei > 0n ? feeFromBps(amountWei, bps) : null;
  const receiveWei = feeWei === null ? null : amountWei - feeWei;

  return {
    bps,
    feeWei,
    receiveWei,
    isLoading: enabled && query.isPending,
    isError: enabled && query.isError,
    blocksFast: speed === "fast" && enabled && !query.isPending && bps === null,
  };
}
