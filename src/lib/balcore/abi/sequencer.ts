/**
 * BalCoreSequencer — risk dials.\n *\n * minPositionValueB is the per-leg floor the "vault open" check compares\n * both reserves against.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   BALCORE_CONTRACTS=<repo> src/lib/balcore/abi/extract-abi.sh
 *
 * Source: balcore-contracts@e419b74 out/BalCoreSequencer.sol/BalCoreSequencer.json
 * Filter: select(.type=="function" and (.name | IN("minPositionValueB","allocCapBps","borrowCapBps","borrowHfFloor")))
 */

export const balcoreSequencerAbi = [
  {
    "type": "function",
    "name": "allocCapBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "borrowCapBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "borrowHfFloor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minPositionValueB",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;
