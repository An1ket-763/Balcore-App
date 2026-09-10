/**
 * ILBPair — Pharaoh Liquidity Book pair.\n *\n * getActiveId is the live bin; compared against rangeLower/rangeUpper to\n * decide whether the position is in range.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   BALCORE_CONTRACTS=<repo> src/lib/balcore/abi/extract-abi.sh
 *
 * Source: balcore-contracts@c190dc0 out/ILBRouter.sol/ILBPair.json
 * Filter: select(.type=="function" and .name=="getActiveId")
 */

export const lbPairAbi = [
  {
    "type": "function",
    "name": "getActiveId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  }
] as const;
