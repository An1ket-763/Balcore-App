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

  const balances = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const token of SWAP_TOKENS) out[token.symbol] = 0;

    try {
      if (native.data) {
        const avax = SWAP_TOKENS.find((t) => t.native);
        if (avax) out[avax.symbol] = Number(formatUnits(native.data.value, native.data.decimals));
      }
    } catch {
      // a malformed read falls back to 0 rather than crashing the panel
    }

    erc20Tokens.forEach((token, i) => {
      const entry = reads.data?.[i];
      if (!entry || entry.status !== "success") return;
      const raw = entry.result;
      if (typeof raw !== "bigint") return;
      const value = Number(formatUnits(raw, token.decimals));
      out[token.symbol] = Number.isFinite(value) ? value : 0;
    });

    return out;
  }, [native.data, reads.data, erc20Tokens]);

  return { balances, isLoading };
}

export function balanceOf(balances: Record<string, number>, token: SwapToken): number {
  return balances[token.symbol] ?? 0;
}
