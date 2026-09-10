#!/usr/bin/env bash
#
# Regenerates the ABI fragments in this directory from the forge artifacts of
# the balcore-contracts repo. NOTHING in ./{bank,vault,sequencer,pair}.ts is
# hand-written: run this script to reproduce them byte-for-byte.
#
#   BALCORE_CONTRACTS=/path/to/balcore-contracts ./extract-abi.sh
#
# Verified against balcore-contracts @ c190dc0 (forge artifacts in out/).
# Requires: jq.
#
# Each fragment is `jq`-selected from out/<Contract>.sol/<Contract>.json by
# member name, so a signature change upstream shows up as a diff here rather
# than as a silent decode failure at runtime.
set -euo pipefail

CONTRACTS="${BALCORE_CONTRACTS:-/Users/amitsurve/balcore-contracts}"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"

[ -d "$CONTRACTS/out" ] || { echo "no forge artifacts at $CONTRACTS/out" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

REV="$(git -C "$CONTRACTS" rev-parse --short HEAD)"

# emit <artifact> <jq-filter> <ts-const> <outfile> <doc-comment>
emit() {
  local artifact="$1" filter="$2" name="$3" file="$4" doc="$5"
  local path="$CONTRACTS/out/$artifact"
  [ -f "$path" ] || { echo "missing artifact: $path" >&2; exit 1; }

  {
    printf '/**\n%s\n *\n' "$doc"
    printf ' * GENERATED — do not edit by hand. Regenerate with:\n'
    printf ' *   BALCORE_CONTRACTS=<repo> src/lib/balcore/abi/extract-abi.sh\n *\n'
    printf ' * Source: balcore-contracts@%s out/%s\n' "$REV" "$artifact"
    printf ' * Filter: %s\n */\n\n' "$filter"
    printf 'export const %s = ' "$name"
    # Command substitution strips jq's trailing newline. Without that the file
    # ends `]\n as const;` and ASI closes the expression at the `]`, leaving
    # `as const;` as a stray statement (TS1434).
    printf '%s as const;\n' "$(jq --indent 2 "[ .abi[] | $filter ]" "$path")"
  } > "$OUT_DIR/$file"

  printf '%-14s %-13s %3d fragments\n' "$file" "$name" "$(jq "[ .abi[] | $filter ] | length" "$path")"
}

# ---------------------------------------------------------------------------
# BalCoreBank — the user-facing deposit / withdraw / yield surface.
# Functions are named explicitly (not a blanket view filter) so an upstream
# addition never silently widens what the frontend is allowed to call.
# ---------------------------------------------------------------------------
BANK_FNS='"positions","getClaimableYield","withdrawRequests","withdrawBasket",
"previewWithdraw","depositValue","isActivated","totalShares","currentEpoch",
"epochs","getCurrentEpoch","totalAssets","LAUNCH_TVL_CAP","tvlCapActive",
"runMode","paused","fastTrackDayStart","fastTrackDayVolume","sourceableValueNow",
"totalResidualValue","pendingBtcb","pendingUsdc","deposit","requestWithdraw",
"executeWithdraw","cancelWithdraw","claimYield","fastTrackWithdraw"'

# ALL custom errors — a revert the UI cannot name is a revert the user cannot act on.
BANK_EVENTS='"Deposited","DepositQueued","WithdrawRequested","WithdrawExecuted",
"WithdrawPartial","WithdrawCancelled","YieldClaimed","FastTrackWithdraw",
"RunModeEntered","RunModeExited"'

emit "BalCoreBank.sol/BalCoreBank.json" \
  "select((.type==\"function\" and (.name | IN($BANK_FNS))) or .type==\"error\" or (.type==\"event\" and (.name | IN($BANK_EVENTS))))" \
  "balcoreBankAbi" "bank.ts" \
  " * BalCoreBank — deposits, withdrawal queue, yield claims, fast-track.\n *\n * Carries EVERY custom error the contract can revert with: a revert the UI\n * cannot name is a revert the user cannot act on."

# ---------------------------------------------------------------------------
# BalCoreVault (the \"trader\") — position, range, reserves, debt, fee dials.
# ---------------------------------------------------------------------------
VAULT_FNS='"tvl","cachedTVL","lastValidPrice","rangeLower","rangeUpper",
"positionKey","btcbReserve","usdcReserve","btcbDebt","usdcDebt",
"pendingHarvestUsdc","reserveVaultBalance","lastDistributionTimestamp",
"lastRebalanceTimestamp","pendingAllocBps","vaultState","feeDialsPacked","SCALE_A2B"'
VAULT_EVENTS='"Rebalanced","FeesHarvested","WeeklySettlement","PendingAllocSet"'

emit "BalCoreVault.sol/BalCoreVault.json" \
  "select((.type==\"function\" and (.name | IN($VAULT_FNS))) or (.type==\"event\" and (.name | IN($VAULT_EVENTS))))" \
  "balcoreVaultAbi" "vault.ts" \
  " * BalCoreVault (the \"trader\") — LP range, reserves, debt and fee dials.\n *\n * Read-only surface: every state change here is keeper- or admin-gated."

# ---------------------------------------------------------------------------
# BalCoreSequencer — the risk dials the vault reads its bounds from.
# ---------------------------------------------------------------------------
emit "BalCoreSequencer.sol/BalCoreSequencer.json" \
  'select(.type=="function" and (.name | IN("minPositionValueB","allocCapBps","borrowCapBps","borrowHfFloor")))' \
  "balcoreSequencerAbi" "sequencer.ts" \
  " * BalCoreSequencer — risk dials.\n *\n * minPositionValueB is the per-leg floor the \"vault open\" check compares\n * both reserves against."

# ---------------------------------------------------------------------------
# ILBPair — the Pharaoh LB pair. Only the active bin is read.
# ---------------------------------------------------------------------------
emit "ILBRouter.sol/ILBPair.json" \
  'select(.type=="function" and .name=="getActiveId")' \
  "lbPairAbi" "pair.ts" \
  " * ILBPair — Pharaoh Liquidity Book pair.\n *\n * getActiveId is the live bin; compared against rangeLower/rangeUpper to\n * decide whether the position is in range."

echo "done — balcore-contracts@$REV"
