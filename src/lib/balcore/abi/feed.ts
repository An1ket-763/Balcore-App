/**
 * AggregatorV3Interface — the Chainlink price feed the contracts read.
 *
 * HAND-WRITTEN, unlike its neighbours in this folder: Chainlink is not a
 * balcore contract, so there is no forge artifact for `extract-abi.sh` to
 * generate this from. Only the one function the app calls is declared.
 *
 * This is the feed `BalCoreVault.fetchAndCheckPrice()` reads
 * (BalCoreVault.sol:1190-1198), i.e. the number the chain actually prices a
 * deposit at — as opposed to `vault.lastValidPrice()`, which is only the
 * deviation anchor and can sit percent-points away from it. Anything a user
 * SEES must come from here; see the note on `feedPrice8` in
 * `reads/useVaultStats.ts`.
 *
 * All Chainlink USD feeds are 8-decimal; `FEED_DECIMALS` in `reads/shared.ts`
 * is the single place that says so.
 */

export const chainlinkFeedAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;
