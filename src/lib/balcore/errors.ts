/**
 * Turning a Balcore revert into something a user can act on.
 *
 * Every write in `writes/` dry-runs through `simulateContract` before the wallet
 * opens, so the common case is that the chain has already told us exactly why
 * the transaction would fail. That answer arrives as a 4-byte selector, and a
 * selector the UI cannot name is a revert the user cannot act on — which is the
 * rule `abi/extract-abi.sh` pulls EVERY custom error into the fragments for.
 *
 * THREE SOURCES OF SELECTOR, in the order they are tried:
 *
 *   1. viem's own decode. `simulateContract` against the bank knows the bank's
 *      ABI, so it hands back a `ContractFunctionRevertedError` with `errorName`
 *      already resolved. Cheapest and most reliable.
 *   2. The raw revert bytes, looked up in an index built from BOTH generated
 *      fragments. This is the case that matters: the bank's user writes call
 *      into the trader (`TRADER.fetchAndCheckPrice()` on deposit,
 *      `TRADER.syncTVL()` on request / cancel / fast-track), so a stale oracle
 *      reverts with a TRADER selector out of a BANK call and viem cannot name
 *      it from the bank ABI alone.
 *   3. The ERC-20 and panic selectors below, which live in neither fragment
 *      because they belong to the token and to the compiler.
 *
 * An unrecognised selector is reported WITH ITS SELECTOR, never as "unknown" —
 * a hex string someone can grep for beats a dead end.
 *
 * Deliberately free of React and wagmi so the whole thing is unit-testable:
 * `errors.test.ts` derives the selectors it asserts on from the ABI rather than
 * hardcoding them, so an upstream rename fails the test instead of silently
 * mapping to nothing.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  toFunctionSelector,
  type Abi,
  type Hex,
} from "viem";
import { balcoreBankAbi } from "./abi/bank.ts";
import { balcoreVaultAbi } from "./abi/vault.ts";

/* ------------------------------------------------------------------ */
/* Extra selectors neither fragment carries                            */
/* ------------------------------------------------------------------ */

/**
 * OpenZeppelin v5 ERC-20 custom errors.
 *
 * HAND-WRITTEN ON PURPOSE, and the only hand-written ABI in this file. These
 * belong to the USDC / BTC.b token contracts, not to Balcore, so
 * `extract-abi.sh` has no artifact to pull them from — the same reason
 * `lfjSwap.ts` hand-writes `erc20ApprovalAbi`. Signatures are the OZ v5
 * `IERC20Errors` interface verbatim; a deposit that fails on allowance or
 * balance fails HERE, at the approve or the transferFrom, which is the most
 * likely first-time failure of all.
 */
export const erc20ErrorAbi = [
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  { type: "error", name: "ERC20InvalidSender", inputs: [{ name: "sender", type: "address" }] },
  { type: "error", name: "ERC20InvalidReceiver", inputs: [{ name: "receiver", type: "address" }] },
  { type: "error", name: "ERC20InvalidApprover", inputs: [{ name: "approver", type: "address" }] },
  { type: "error", name: "ERC20InvalidSpender", inputs: [{ name: "spender", type: "address" }] },
] as const satisfies Abi;

/**
 * The two selectors solc itself emits: `require(cond, "msg")` and an
 * arithmetic/assertion failure. Not custom errors, but they arrive through the
 * same channel and must not fall through to "unrecognised".
 */
const SOLIDITY_ERROR_ABI = [
  { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] },
  { type: "error", name: "Panic", inputs: [{ name: "code", type: "uint256" }] },
] as const satisfies Abi;

/* ------------------------------------------------------------------ */
/* Selector index                                                      */
/* ------------------------------------------------------------------ */

interface ErrorEntry {
  name: string;
  /** The ABI that can decode this error's arguments. */
  abi: Abi;
  signature: string;
}

/** `ErrorName(type,type)` — the string the selector is the hash of. */
function errorSignature(item: { name?: string; inputs?: readonly { type: string }[] }): string {
  return `${item.name ?? ""}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
}

/**
 * selector → entry, built once at module load from every source above.
 *
 * Build order is least-specific first so a name present in more than one
 * fragment (the bank and the trader both declare `ZeroAmount`,
 * `DepositAlreadyQueued`, `NoWithdrawRequest` and more) resolves to the same
 * selector either way — which it must, since the selector IS the signature
 * hash. A collision is therefore a no-op, not a conflict.
 */
const SELECTORS: ReadonlyMap<string, ErrorEntry> = (() => {
  const map = new Map<string, ErrorEntry>();
  const add = (abi: Abi) => {
    for (const item of abi) {
      if (item.type !== "error") continue;
      const signature = errorSignature(item);
      try {
        map.set(toFunctionSelector(signature as never).toLowerCase(), {
          name: item.name,
          abi,
          signature,
        });
      } catch {
        // A malformed fragment must not take the module down at import time.
      }
    }
  };
  add(SOLIDITY_ERROR_ABI as unknown as Abi);
  add(erc20ErrorAbi as unknown as Abi);
  add(balcoreVaultAbi as unknown as Abi);
  add(balcoreBankAbi as unknown as Abi);
  return map;
})();

/** Every selector the decoder can name. Exported for the test and the harness. */
export function knownErrorSelectors(): ReadonlyMap<string, string> {
  return new Map([...SELECTORS].map(([sel, e]) => [sel, e.name]));
}

/* ------------------------------------------------------------------ */
/* Which write is this?                                                */
/* ------------------------------------------------------------------ */

/**
 * Several errors are shared across writes and mean DIFFERENT things in each.
 *
 * `ZeroAmount()` is the clearest case: on `deposit` it means a leg was left
 * blank (BalCoreBank.sol:480), and on `requestWithdraw` / `fastTrackWithdraw`
 * it means the caller holds no shares at all (:683, :1098). One message cannot
 * serve both without lying, so the caller says which write it ran.
 * `DepositAlreadyQueued()` is the same story across `deposit` (:529) and
 * `cancelWithdraw` (:1405).
 */
export type WriteContext =
  | "approve"
  | "deposit"
  | "requestWithdraw"
  | "executeWithdraw"
  | "cancelWithdraw"
  | "claimYield"
  | "fastTrack"
  | "swap";

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * One user-facing sentence per error name, plus per-context overrides.
 *
 * Written for someone who has never read the contracts: say what happened and
 * what to do, never the error name. Where the revert carries arguments worth
 * showing, `withArgs` formats them — the cap and the ready-time are the two
 * that genuinely change what the user does next.
 */
interface MessageSpec {
  /** Default sentence. */
  text: string;
  /** Per-write overrides, where the same selector means something else. */
  byContext?: Partial<Record<WriteContext, string>>;
  /** Richer sentence built from the decoded arguments. */
  withArgs?: (args: readonly unknown[], context: WriteContext) => string | null;
}

const asBigint = (v: unknown): bigint | null => (typeof v === "bigint" ? v : null);

/** tokenB atoms (6-dec USDC) as a plain dollar string. */
function usdc(v: bigint): string {
  const whole = v / 1_000_000n;
  return `$${whole.toLocaleString("en-US")}`;
}

function unixDate(seconds: bigint): string {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "later";
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const MESSAGES: Record<string, MessageSpec> = {
  /* ---- deposit ---- */
  DepositRatioOutOfBounds: {
    // BalCoreBank.sol:491 passes (btcbValueInUsdc, usdcAmount) into a signature
    // whose ABI names are (ratio, max) — the names are historical, the values
    // are the two legs in tokenB terms. VaultMath.sol:810 is the ±1% check.
    text: "The two amounts have to match within 1% of each other at the live price. Adjust one side and try again.",
    withArgs: (args) => {
      const a = asBigint(args[0]);
      const b = asBigint(args[1]);
      if (a === null || b === null) return null;
      return `The two amounts have to match within 1% at the live price. Right now they are worth ${usdc(a)} and ${usdc(b)} — adjust one side and try again.`;
    },
  },
  TVLCapExceeded: {
    text: "This pool has reached its deposit cap. Try a smaller amount.",
    withArgs: (args) => {
      const current = asBigint(args[0]);
      const cap = asBigint(args[1]);
      if (current === null || cap === null) return null;
      const room = cap > current ? cap - current : 0n;
      return room > 0n
        ? `This pool is near its deposit cap — about ${usdc(room)} of room left. Try a smaller amount.`
        : "This pool has reached its deposit cap and cannot take more right now.";
    },
  },
  DepositAlreadyQueued: {
    text: "You already have a deposit waiting to activate. Only one at a time.",
    byContext: {
      deposit:
        "You already have a deposit waiting for the next Tuesday settlement. Only one at a time — wait for it to activate, then deposit again.",
      cancelWithdraw:
        "Cancelling would re-enter your basket as a new deposit, and you already hold a position or a queued deposit. Collect the withdrawal instead.",
    },
  },

  /* ---- withdrawal queue ---- */
  WithdrawRequestAlreadyExists: {
    text: "You already have a withdrawal request on this pool. Collect it or cancel it first.",
  },
  NoWithdrawRequest: {
    text: "There is no withdrawal request to act on.",
    byContext: {
      executeWithdraw: "There is nothing to collect — no withdrawal request is open.",
      cancelWithdraw: "There is no withdrawal request to cancel.",
    },
  },
  WithdrawNotReady: {
    text: "This withdrawal is not ready yet. Withdrawals are available 7 days after the request.",
    withArgs: (args) => {
      const readyAt = asBigint(args[0]);
      if (readyAt === null) return null;
      return `Not ready yet — you can collect this from ${unixDate(readyAt)}.`;
    },
  },
  NotHeadOfQueue: {
    text: "The pool is serving withdrawals strictly in order right now, and you are not at the front of the queue yet. Your request keeps its place; try again later.",
  },

  /* ---- yield ---- */
  NothingToClaim: {
    text: "No settled yield to claim yet. Yield is credited at the weekly settlement (Tuesday 00:00 UTC) and only for epochs you were already in.",
  },

  /* ---- fast-track ---- */
  FastTrackSuspendedDuringRun: {
    text: "Instant withdrawal is switched off while the pool works through its withdrawal queue. The standard 7-day withdrawal still works.",
  },
  FastTrackDailyLimitReached: {
    text: "Instant withdrawals have used up today's allowance for this pool. Try again after the daily reset, or use the standard 7-day withdrawal.",
  },
  FastTrackPoolInsufficient: {
    text: "There is not enough liquid value on hand to pay an instant withdrawal in full right now. The standard 7-day withdrawal can be paid in parts; this one cannot.",
  },

  /* ---- oracle: the trader's guards, reached through every bank write ---- */
  StalePriceData: {
    text: "The price feed has not updated recently enough, so the pool will not price anything right now. Nothing was sent — try again in a few minutes.",
  },
  OracleOutOfBounds: {
    text: "The price feed is reporting a value outside the pool's safety bounds, so it has stopped pricing. Nothing was sent.",
  },
  OraclePriceDeviation: {
    text: "The price moved further than the pool allows between two reads, which is the flash-manipulation guard. Nothing was sent — try again shortly.",
  },
  InvalidOracleBounds: { text: "The pool's price bounds are misconfigured. Nothing was sent." },

  /* ---- tokens ---- */
  ERC20InsufficientBalance: {
    text: "Your wallet does not hold enough of that token.",
    withArgs: (args) => {
      const balance = asBigint(args[1]);
      const needed = asBigint(args[2]);
      if (balance === null || needed === null) return null;
      return `Your wallet is short: the transfer needs ${needed} of the token's smallest unit and holds ${balance}.`;
    },
  },
  ERC20InsufficientAllowance: {
    text: "This pool is not approved to move that token yet. Approve it and try again.",
  },
  SafeERC20FailedOperation: {
    text: "A token transfer was rejected by the token contract. Nothing was sent.",
  },

  /* ---- protocol state ---- */
  EnforcedPause: {
    text: "This pool is paused. Deposits and withdrawals are closed until it is unpaused.",
  },
  ExpectedPause: { text: "That action is only available while the pool is paused." },
  ReentrancyGuardReentrantCall: {
    text: "The pool rejected a re-entrant call. Nothing was sent — try again.",
  },
  BenqiCallFailed: {
    text: "The lending market the pool keeps its reserve in rejected the call. Nothing was sent.",
    withArgs: (args) => {
      const code = asBigint(args[0]);
      return code === null
        ? null
        : `The lending market the pool keeps its reserve in rejected the call (code ${code}). Nothing was sent.`;
    },
  },
  ZeroAmount: {
    text: "Enter an amount.",
    byContext: {
      deposit: "Both amounts must be above zero — this pool takes the two tokens together.",
      requestWithdraw: "You have no position in this pool to withdraw.",
      fastTrack: "You have no position in this pool to withdraw.",
    },
  },

  /* ---- permissions: a user should never see these ---- */
  NotAdmin: { text: "That action is reserved for the protocol multisig." },
  NotKeeper: { text: "That action is reserved for the protocol keeper." },
  NotTrader: { text: "That call has to come from the pool's own vault contract." },
  NotBank: { text: "That call has to come from the pool's own bank contract." },
  NotSequencer: { text: "That call has to come from the pool's own sequencer contract." },
  AccessControlUnauthorizedAccount: {
    text: "Your wallet does not hold the role this action needs.",
  },

  /* ---- compiler ---- */
  Error: {
    text: "The pool rejected the transaction.",
    withArgs: (args) => (typeof args[0] === "string" && args[0] ? args[0] : null),
  },
  Panic: {
    text: "The pool hit an internal arithmetic or assertion failure. Nothing was sent.",
  },
};

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

export interface DecodedBalcoreError {
  /** 4-byte selector, lowercased, when any revert data was recovered. */
  selector: Hex | null;
  /** Error name, when the selector is in the index. */
  name: string | null;
  /** `Name(type,type)`, when known. */
  signature: string | null;
  /** Decoded arguments, empty when there are none or decoding failed. */
  args: readonly unknown[];
  /** A sentence safe to put in front of a user. Never empty. */
  message: string;
  /** False when the selector was recovered but is not in the index. */
  known: boolean;
  /** True when no revert data was recovered at all (RPC trouble, user reject). */
  noRevertData: boolean;
}

/** Pull the 4-byte-prefixed revert payload out of whatever viem threw. */
function revertData(err: unknown): Hex | null {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      // `raw` carries the full payload; `signature` is just the 4-byte selector
      // and is what viem sets when it could not match the ABI. Either is enough
      // to name the error, since the selector is the lookup key.
      const maybe = reverted as unknown as { raw?: unknown; signature?: unknown };
      if (typeof maybe.raw === "string" && maybe.raw.startsWith("0x")) return maybe.raw as Hex;
      if (typeof maybe.signature === "string" && maybe.signature.startsWith("0x")) {
        return maybe.signature as Hex;
      }
    }
  }
  // Providers and the simulate path both surface the payload as `.data`
  // somewhere on the chain of causes.
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur; depth++) {
    const node = cur as { data?: unknown; cause?: unknown };
    const d = node.data;
    if (typeof d === "string" && /^0x[0-9a-fA-F]*$/.test(d) && d.length >= 10) return d as Hex;
    if (d && typeof d === "object") {
      const inner = (d as { data?: unknown }).data;
      if (typeof inner === "string" && /^0x[0-9a-fA-F]*$/.test(inner) && inner.length >= 10) {
        return inner as Hex;
      }
    }
    cur = node.cause;
  }
  return null;
}

/** The name viem itself resolved, when it managed to. */
function viemErrorName(err: unknown): { name: string; args: readonly unknown[] } | null {
  if (!(err instanceof BaseError)) return null;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  const name = reverted.data?.errorName;
  if (!name) return null;
  return { name, args: reverted.data?.args ?? [] };
}

function render(name: string, args: readonly unknown[], context: WriteContext): string {
  const spec = MESSAGES[name];
  if (!spec) {
    // In the index but with no copy written for it: name it rather than invent.
    return `The pool rejected the transaction (${name}). Nothing was sent.`;
  }
  const rich = spec.withArgs?.(args, context);
  if (rich) return rich;
  return spec.byContext?.[context] ?? spec.text;
}

/**
 * Decode a revert into a selector, a name and a sentence.
 *
 * Never throws and never returns an empty message: the worst case is a named
 * selector the reader can search for.
 */
export function decodeBalcoreError(
  err: unknown,
  context: WriteContext = "deposit",
): DecodedBalcoreError {
  // 1. viem already named it.
  const byViem = viemErrorName(err);
  if (byViem) {
    const sel = (() => {
      const hit = [...SELECTORS].find(([, e]) => e.name === byViem.name);
      return hit ? (hit[0] as Hex) : null;
    })();
    return {
      selector: sel,
      name: byViem.name,
      signature: sel ? (SELECTORS.get(sel)?.signature ?? null) : null,
      args: byViem.args,
      message: render(byViem.name, byViem.args, context),
      known: true,
      noRevertData: false,
    };
  }

  // 2 & 3. Raw bytes against the index.
  const data = revertData(err);
  if (!data) {
    return {
      selector: null,
      name: null,
      signature: null,
      args: [],
      message: walletMessage(err),
      known: false,
      noRevertData: true,
    };
  }

  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const entry = SELECTORS.get(selector);
  if (!entry) {
    return {
      selector,
      name: null,
      signature: null,
      args: [],
      // THE RULE: show the selector. An unnameable revert the user can quote to
      // support beats "something went wrong".
      message: `The pool rejected the transaction with an error this app does not recognise (${selector}). Nothing was sent — please report this selector.`,
      known: false,
      noRevertData: false,
    };
  }

  let args: readonly unknown[] = [];
  if (data.length > 10) {
    try {
      const decoded = decodeErrorResult({ abi: entry.abi, data });
      args = decoded.args ?? [];
    } catch {
      // Selector matched but the payload did not decode: still name the error.
    }
  }

  return {
    selector,
    name: entry.name,
    signature: entry.signature,
    args,
    message: render(entry.name, args, context),
    known: true,
    noRevertData: false,
  };
}

/** Just the sentence. */
export function balcoreErrorMessage(err: unknown, context: WriteContext = "deposit"): string {
  return decodeBalcoreError(err, context).message;
}

/**
 * Wallet- and transport-level failures, which carry no revert data.
 *
 * Kept separate from the contract messages because the advice differs: a user
 * rejection needs no explanation, a missing-gas error is about the wallet, and
 * an unreachable node is about the network — none of them mean the pool said no.
 */
export function walletMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/User rejected|rejected the request|User denied|denied transaction/i.test(msg)) {
    return "Rejected in your wallet — nothing was sent.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough AVAX in your wallet to pay the network fee.";
  }
  if (/chain mismatch|does not match the target chain/i.test(msg)) {
    return "Your wallet is on the wrong network — switch to Avalanche and try again.";
  }
  if (/nonce/i.test(msg)) {
    return "Your wallet's transaction count is out of step. Reset the account's nonce or retry.";
  }
  if (/timeout|timed out|fetch failed|network ?error|Failed to fetch/i.test(msg)) {
    return "Could not reach the network. Nothing was sent — check your connection and try again.";
  }
  return "The transaction could not be completed. Nothing was sent — try again.";
}
