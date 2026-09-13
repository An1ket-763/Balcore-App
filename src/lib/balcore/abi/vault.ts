/**
 * BalCoreVault (the "trader") — LP range, reserves, debt and fee dials.\n *\n * Read-only surface: every state change here is keeper- or admin-gated.\n *\n * Carries EVERY custom error the contract can revert with: the bank's user\n * writes call into the trader, so these selectors come back from bank calls.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   BALCORE_CONTRACTS=<repo> src/lib/balcore/abi/extract-abi.sh
 *
 * Source: balcore-contracts@e419b74 out/BalCoreVault.sol/BalCoreVault.json
 * Filter: select((.type=="function" and (.name | IN("tvl","cachedTVL","lastValidPrice","rangeLower","rangeUpper",
"positionKey","btcbReserve","usdcReserve","btcbDebt","usdcDebt",
"pendingHarvestUsdc","reserveVaultBalance","lastDistributionTimestamp",
"lastRebalanceTimestamp","pendingAllocBps","vaultState","feeDialsPacked","SCALE_A2B"))) or .type=="error" or (.type=="event" and (.name | IN("Rebalanced","FeesHarvested","WeeklySettlement","PendingAllocSet"))))
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
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AllocBpsOutOfRange",
    "inputs": [
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AlreadyBound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BenqiCallFailed",
    "inputs": [
      {
        "name": "errorCode",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BenqiMarketModeMismatch",
    "inputs": [
      {
        "name": "qToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "nativeExpected",
        "type": "bool",
        "internalType": "bool"
      }
    ]
  },
  {
    "type": "error",
    "name": "BenqiMarketNotListed",
    "inputs": [
      {
        "name": "qToken",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "BorrowCapExceeded",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BorrowRateLimited",
    "inputs": [
      {
        "name": "nextAllowed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CannotParkFromPhase",
    "inputs": [
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "CannotResetFromPhase",
    "inputs": [
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "DepletionBorrowFailed",
    "inputs": [
      {
        "name": "currentHF",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requiredHF",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DepositAlreadyQueued",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DepositRatioOutOfBounds",
    "inputs": [
      {
        "name": "ratio",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNotSettled",
    "inputs": [
      {
        "name": "epochId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FastTrackDailyLimitReached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FastTrackPoolInsufficient",
    "inputs": []
  },
  {
    "type": "error",
    "name": "HealthFactorAtMinimum",
    "inputs": [
      {
        "name": "currentHF",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimumHF",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "HealthFactorTooLow",
    "inputs": [
      {
        "name": "current",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimum",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "IllegalReversalTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDecimalsConfig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDowngradeDeadline",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidOracleBounds",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPoolAddress",
    "inputs": [
      {
        "name": "derived",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidStateTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.VaultState"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.VaultState"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidTickRange",
    "inputs": [
      {
        "name": "tickLower",
        "type": "int32",
        "internalType": "int32"
      },
      {
        "name": "tickUpper",
        "type": "int32",
        "internalType": "int32"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidToken",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "MinPositionNotMet",
    "inputs": [
      {
        "name": "positionValueUsdc",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimumUsdc",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoLeveragedPosition",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoWithdrawRequest",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAdmin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotBank",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInReversalBet",
    "inputs": [
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotKeeper",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotSequencer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OracleOutOfBounds",
    "inputs": [
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "min",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OraclePriceDeviation",
    "inputs": [
      {
        "name": "price",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ParamBound",
    "inputs": [
      {
        "name": "key",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "v",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "RatioBeyondMaximum",
    "inputs": [
      {
        "name": "ratioBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "RebalanceDuringBet",
    "inputs": [
      {
        "name": "phase",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReversalAlreadyActive",
    "inputs": [
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum IBalCoreVault.ReversalPhase"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReversedPairUnsupported",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SolvencyNotBreached",
    "inputs": [
      {
        "name": "hf",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "floor",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SqrtPriceOutOfRange",
    "inputs": [
      {
        "name": "sqrtPriceX96",
        "type": "uint160",
        "internalType": "uint160"
      }
    ]
  },
  {
    "type": "error",
    "name": "StalePriceData",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TVLCapExceeded",
    "inputs": [
      {
        "name": "currentTVL",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokenNotDepleted",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnderlyingMismatch",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnexpectedNativeSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VenueVaultMismatch",
    "inputs": [
      {
        "name": "venue",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "WithdrawNotReady",
    "inputs": [
      {
        "name": "readyAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "currentTime",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "WithdrawRequestAlreadyExists",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;
