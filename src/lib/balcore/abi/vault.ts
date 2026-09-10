/**
 * BalCoreVault (the "trader") — LP range, reserves, debt and fee dials.\n *\n * Read-only surface: every state change here is keeper- or admin-gated.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   BALCORE_CONTRACTS=<repo> src/lib/balcore/abi/extract-abi.sh
 *
 * Source: balcore-contracts@c190dc0 out/BalCoreVault.sol/BalCoreVault.json
 * Filter: select((.type=="function" and (.name | IN("tvl","cachedTVL","lastValidPrice","rangeLower","rangeUpper",
"positionKey","btcbReserve","usdcReserve","btcbDebt","usdcDebt",
"pendingHarvestUsdc","reserveVaultBalance","lastDistributionTimestamp",
"lastRebalanceTimestamp","pendingAllocBps","vaultState","feeDialsPacked","SCALE_A2B"))) or (.type=="event" and (.name | IN("Rebalanced","FeesHarvested","WeeklySettlement","PendingAllocSet"))))
 */

export const balcoreVaultAbi = [
  {
    "type": "function",
    "name": "SCALE_A2B",
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
    "name": "btcbDebt",
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
    "name": "btcbReserve",
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
    "name": "cachedTVL",
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
    "name": "feeDialsPacked",
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
    "name": "lastDistributionTimestamp",
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
    "name": "lastRebalanceTimestamp",
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
    "name": "lastValidPrice",
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
    "name": "pendingAllocBps",
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
    "name": "pendingHarvestUsdc",
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
    "name": "positionKey",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rangeLower",
    "inputs": [],
    "outputs": [
      {
        "name": "lower",
        "type": "int32",
        "internalType": "int32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rangeUpper",
    "inputs": [],
    "outputs": [
      {
        "name": "upper",
        "type": "int32",
        "internalType": "int32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reserveVaultBalance",
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
    "name": "tvl",
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
    "name": "usdcDebt",
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
    "name": "usdcReserve",
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
    "name": "vaultState",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.VaultState"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "FeesHarvested",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "feeUsdc",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "swappedFromA",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "pendingTotal",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PendingAllocSet",
    "inputs": [
      {
        "name": "bps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Rebalanced",
    "inputs": [
      {
        "name": "signal",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum IBalCoreVault.RebalanceSignal"
      },
      {
        "name": "oldRangeLower",
        "type": "int32",
        "indexed": false,
        "internalType": "int32"
      },
      {
        "name": "oldRangeUpper",
        "type": "int32",
        "indexed": false,
        "internalType": "int32"
      },
      {
        "name": "newRangeLower",
        "type": "int32",
        "indexed": false,
        "internalType": "int32"
      },
      {
        "name": "newRangeUpper",
        "type": "int32",
        "indexed": false,
        "internalType": "int32"
      },
      {
        "name": "oldPositionKey",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "newPositionKey",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WeeklySettlement",
    "inputs": [
      {
        "name": "epochId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "grossYield",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "ilCost",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "unresolvedGap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "protocolFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "userYield",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reserveVaultDelta",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
