import { useMemo } from "react";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { defaultChain } from "@/lib/wagmi";
import { SWAP_TOKENS, type SwapToken } from "@/lib/tokens";
import { erc20Abi } from "./balances";

/**
 * Live balances for the swap token list, keyed by symbol.
 *
 * Deliberately separate from `useTokenBalances` in balances.ts: that hook feeds
 * the portfolio views and still carries mock rows for assets that aren't real
 * tokens, and widening it would ripple through screens this change has no
 * business touching. The ERC-20 reads here batch into one multicall.
 */
export interface SwapBalances {
  balances: Record<string, number>;
  /**
   * The same balances in each token's smallest unit.
   *
   * The float map above is for display only. Anything deciding how much a user
   * may actually spend must read these instead: formatting to a float and
   * parsing back loses precision on 18-decimal tokens, and an amount derived
   * that way can land above the real balance and revert.
   */
  raw: Record<string, bigint>;
  isLoading: boolean;
}

export function useSwapBalances(): SwapBalances {
  const { address, isConnected } = useAccount();
  const enabled = Boolean(address) && isConnected;

  const native = useBalance({ address, chainId: defaultChain.id, query: { enabled } });

  const erc20Tokens = useMemo(() => SWAP_TOKENS.filter((t) => !t.native), []);

  const reads = useReadContracts({
    contracts: erc20Tokens.map((t) => ({
      abi: erc20Abi,
      address: t.address,
      functionName: "balanceOf" as const,
      args: address ? ([address] as const) : undefined,
      chainId: defaultChain.id,
    })),
    allowFailure: true,
    query: { enabled },
  });

  const isLoading = enabled && (native.isLoading || reads.isLoading);

  const { balances, raw } = useMemo(() => {
    const out: Record<string, number> = {};
    const rawOut: Record<string, bigint> = {};
    for (const token of SWAP_TOKENS) {
      out[token.symbol] = 0;
      rawOut[token.symbol] = 0n;
    }

    try {
      if (native.data) {
        const avax = SWAP_TOKENS.find((t) => t.native);
        if (avax) {
          rawOut[avax.symbol] = native.data.value;
          out[avax.symbol] = Number(formatUnits(native.data.value, native.data.decimals));
        }
      }
    } catch {
      // a malformed read falls back to 0 rather than crashing the panel
    }

    erc20Tokens.forEach((token, i) => {
      const entry = reads.data?.[i];
      if (!entry || entry.status !== "success") return;
      const value = entry.result;
      if (typeof value !== "bigint") return;
      rawOut[token.symbol] = value;
      const asNumber = Number(formatUnits(value, token.decimals));
      out[token.symbol] = Number.isFinite(asNumber) ? asNumber : 0;
    });

    return { balances: out, raw: rawOut };
  }, [native.data, reads.data, erc20Tokens]);

  return { balances, raw, isLoading };
}

export function balanceOf(balances: Record<string, number>, token: SwapToken): number {
  return balances[token.symbol] ?? 0;
}

/** Exact balance in the token's smallest unit. Use this for spend decisions. */
export function rawBalanceOf(raw: Record<string, bigint>, token: SwapToken): bigint {
  return raw[token.symbol] ?? 0n;
}
