/**
 * Pharaoh Exchange — concentrated-liquidity DEX on Avalanche C-Chain.
 *
 * Pharaoh is a Ramses V3 fork, which matters for the ABI: pools are keyed by
 * `tickSpacing` (int24), NOT by the `fee` field a stock Uniswap V3 deployment
 * uses. Encoding a `fee` here would silently address the wrong pool, so every
 * struct below mirrors the deployed contracts exactly.
 *
 * Addresses from https://docs.pharaoh.exchange/pages/contract-addresses
 * and verified against the on-chain ABIs on Snowtrace.
 */

import { encodeFunctionData, type Address } from "viem";

export const PHARAOH_SWAP_ROUTER = "0xc8B8fCbDb5C019D7802fFb0b39603395D7d3915c" as const;
export const PHARAOH_QUOTER_V2 = "0xB7297301b7CC659BB96D51754643A0Df6eEA2138" as const;
export const PHARAOH_CL_FACTORY = "0xAE6E5c62328ade73ceefD42228528b70c8157D0d" as const;

/**
 * Tick spacings to probe for the WAVAX/USDC pool.
 *
 * RamsesV3Factory has no "list every enabled tick spacing" getter — the only
 * on-chain record is the TickSpacingEnabled event — so we quote each candidate
 * and keep the best fill. A tick spacing with no pool simply reverts and is
 * dropped, which costs nothing extra: all candidates go out in one multicall.
 */
export const PHARAOH_TICK_SPACINGS = [1, 5, 10, 50, 100, 200, 500, 2000] as const;

/**
 * QuoterV2 — declared `view` here on purpose.
 *
 * On-chain it is `nonpayable` because it simulates the swap and unwinds via a
 * revert in the callback. Marking it `view` lets viem route it through
 * eth_call / multicall3 (which uses CALL, not STATICCALL), the same trick every
 * Uniswap V3 front-end uses. It never produces a transaction.
 */
export const pharaohQuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "tickSpacing", type: "int24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** SwapRouter — only the pieces needed for single-hop native AVAX <-> USDC. */
export const pharaohRouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "tickSpacing", type: "int24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "unwrapWETH9",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

export interface PharaohSwapArgs {
  tokenIn: Address;
  tokenOut: Address;
  tickSpacing: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: Address;
  deadline: bigint;
  /** True when the OUTPUT should be delivered as native AVAX rather than WAVAX. */
  unwrapToNative: boolean;
}

/**
 * Build the SwapRouter call for a single-hop Pharaoh swap.
 *
 * AVAX in  -> the router wraps the attached `value` itself, so we just send it.
 * AVAX out -> the swap must land WAVAX on the router, then `unwrapWETH9`
 *             forwards native AVAX to the user. Both legs go in one multicall
 *             so a failed unwrap can't strand WAVAX in the router.
 */
export function buildPharaohSwap(args: PharaohSwapArgs) {
  const params = {
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    tickSpacing: args.tickSpacing,
    // For the unwrap path the swap output must be held by the router first.
    recipient: args.unwrapToNative ? (PHARAOH_SWAP_ROUTER as Address) : args.recipient,
    deadline: args.deadline,
    amountIn: args.amountIn,
    amountOutMinimum: args.amountOutMinimum,
    sqrtPriceLimitX96: 0n,
  } as const;

  if (!args.unwrapToNative) {
    return {
      functionName: "exactInputSingle" as const,
      args: [params] as const,
    };
  }

  const swapCall = encodeFunctionData({
    abi: pharaohRouterAbi,
    functionName: "exactInputSingle",
    args: [params],
  });
  const unwrapCall = encodeFunctionData({
    abi: pharaohRouterAbi,
    functionName: "unwrapWETH9",
    args: [args.amountOutMinimum, args.recipient],
  });

  return {
    functionName: "multicall" as const,
    args: [[swapCall, unwrapCall]] as const,
  };
}
