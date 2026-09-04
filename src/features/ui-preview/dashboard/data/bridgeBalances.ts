import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { BRIDGE_CHAINS, USDC_DECIMALS, type BridgeChain } from "@/lib/cctp";
import { erc20Abi } from "./balances";

/**
 * Native USDC balance for the connected wallet on every bridgeable chain.
 *
 * Reading all of them at once rather than only the selected one is deliberate:
 * switching a chain chip is then instant, and the panel can tell the difference
 * between "you hold nothing here" and "we haven't looked yet". The wallet does
 * NOT need to be connected to a chain to be read on it — each read carries its
 * own `chainId` and goes out over that chain's transport.
 *
 * Balances are kept in USDC's smallest unit. The float is only ever derived for
 * display: deciding how much a user may send from a float is how the swap ended
 * up offering a Max it could not cover.
 */
export interface BridgeBalances {
  /** Keyed by BridgeChain.key, in USDC's smallest unit. */
  raw: Record<string, bigint>;
  isLoading: boolean;
  /** True when at least one chain's read failed — the rest are still usable. */
  hasPartialFailure: boolean;
}

export function useBridgeBalances(): BridgeBalances {
  const { address, isConnected } = useAccount();
  const enabled = Boolean(address) && isConnected;

  const contracts = useMemo(
    () =>
      BRIDGE_CHAINS.map((chain) => ({
        abi: erc20Abi,
        address: chain.usdc,
        functionName: "balanceOf" as const,
        args: address ? ([address] as const) : undefined,
        chainId: chain.chainId,
      })),
    [address],
  );

  const reads = useReadContracts({
    contracts,
    // One dead RPC must not blank out the other four chains.
    allowFailure: true,
    query: { enabled, refetchInterval: enabled ? 30_000 : false },
  });

  return useMemo<BridgeBalances>(() => {
    const raw: Record<string, bigint> = {};
    let failures = 0;

    BRIDGE_CHAINS.forEach((chain, i) => {
      raw[chain.key] = 0n;
      const entry = reads.data?.[i];
      if (!entry) return;
      if (entry.status !== "success") {
        failures += 1;
        return;
      }
      if (typeof entry.result === "bigint") raw[chain.key] = entry.result;
    });

    return {
      raw,
      isLoading: enabled && reads.isLoading,
      hasPartialFailure: failures > 0,
    };
  }, [reads.data, reads.isLoading, enabled]);
}

/** Exact balance on one chain, in USDC's smallest unit. */
export function bridgeBalanceOf(raw: Record<string, bigint>, chain: BridgeChain | null): bigint {
  if (!chain) return 0n;
  return raw[chain.key] ?? 0n;
}

/** Display string for a USDC amount held in smallest units. */
export function formatUsdc(wei: bigint): string {
  const value = Number(formatUnits(wei, USDC_DECIMALS));
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
