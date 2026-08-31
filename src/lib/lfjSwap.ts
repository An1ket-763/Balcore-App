/**
 * LFJ (formerly Trader Joe) Liquidity Book V2.2 — Avalanche C-Chain mainnet.
 *
 * Addresses from https://developers.lfj.gg/deployment-addresses/avalanche
 * Interfaces from https://developers.lfj.gg/contracts/lbquoter and
 * https://developers.lfj.gg/contracts/interfaces/ilbrouter
 *
 * The bin step / pair is NOT hardcoded: LBQuoter.findBestPathFromAmountIn
 * resolves the active liquid pair (pairs, binSteps, versions) for the token
 * route and we feed exactly that back into LBRouter's Path struct.
 */

export const LB_ROUTER_ADDRESS = "0x18556DA13313f3532c54711497A8FedAC273220E" as const;
export const LB_QUOTER_ADDRESS = "0x9A550a522BBaDFB69019b0432800Ed17855A51C3" as const;

/** Wrapped AVAX on Avalanche C-Chain — the LB route token that stands in for native AVAX. */
export const WAVAX_ADDRESS = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" as const;

export const AVAX_DECIMALS = 18;
export const USDC_DECIMALS = 6;

/** LBQuoter — read-only quote discovery. */
export const lbQuoterAbi = [
  {
    type: "function",
    name: "findBestPathFromAmountIn",
    stateMutability: "view",
    inputs: [
      { name: "route", type: "address[]" },
      { name: "amountIn", type: "uint128" },
    ],
    outputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "route", type: "address[]" },
          { name: "pairs", type: "address[]" },
          { name: "binSteps", type: "uint256[]" },
          { name: "versions", type: "uint8[]" },
          { name: "amounts", type: "uint128[]" },
          { name: "virtualAmountsWithoutSlippage", type: "uint128[]" },
          { name: "fees", type: "uint128[]" },
        ],
      },
    ],
  },
] as const;

/** LBRouter — only the two writes needed for native AVAX <-> USDC. */
export const lbRouterAbi = [
  {
    type: "function",
    name: "swapExactNATIVEForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      {
        name: "path",
        type: "tuple",
        components: [
          { name: "pairBinSteps", type: "uint256[]" },
          { name: "versions", type: "uint8[]" },
          { name: "tokenPath", type: "address[]" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapExactTokensForNATIVE",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinNATIVE", type: "uint256" },
      {
        name: "path",
        type: "tuple",
        components: [
          { name: "pairBinSteps", type: "uint256[]" },
          { name: "versions", type: "uint8[]" },
          { name: "tokenPath", type: "address[]" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** Minimal ERC-20 pieces needed for the USDC -> AVAX approval step. */
export const erc20ApprovalAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type SwapDirection = "AVAX_TO_USDC" | "USDC_TO_AVAX";

/** Swap deadline: 10 minutes from now, as seconds. */
export function swapDeadline(minutes = 10): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}
