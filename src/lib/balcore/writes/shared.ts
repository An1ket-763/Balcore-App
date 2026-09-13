/**
 * Shared plumbing for the Balcore write hooks.
 *
 * Every hook in this directory has the same skeleton as
 * `data/bridgeBurn.ts` — `{ stage, error, needsApproval, needsSwitch, isBusy,
 * ...actions, reset }` — because the panels already know how to render that
 * shape and because the discipline it encodes is the one that matters here:
 *
 *   THE WALLET DOES NOT OPEN UNTIL THE CHAIN HAS AGREED.
 *
 * Deposits and withdrawals move real money through four contracts and an oracle
 * guard. A revert discovered after signing costs gas and tells the user nothing;
 * the same revert discovered in an `eth_call` costs nothing and names itself.
 * So every action here simulates first, and `simulateOrThrow` is the one place
 * that rule lives.
 *
 * The asymmetry in `simulateOrThrow` is deliberate and is `txPreflight.ts`'s
 * rule restated: only a GENUINE REVERT may block the user. A timeout, a
 * rate-limited node or a dead RPC must fall through and let the wallet do its
 * own estimate, because turning a flaky network into a hard gate makes a
 * working app look broken.
 */

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20ApprovalAbi } from "@/lib/lfjSwap";
import { PreflightError, isRevert } from "@/lib/txPreflight";
import { defaultChain } from "@/lib/wagmi";
import { BALCORE_CHAIN_ID, BALCORE_DEPLOYED } from "../config/addresses";
import type { WriteStage } from "./stages.ts";
import { balcoreErrorMessage, decodeBalcoreError, type WriteContext } from "../errors";

/* ------------------------------------------------------------------ */
/* Stages — defined in stages.ts (React-free, so the tests can reach them)   */
/* ------------------------------------------------------------------ */

export {
  isBusyStage,
  planDepositStages,
  nextStage,
  type WriteStage,
  type DepositStagePlanInput,
} from "./stages.ts";

/**
 * The common surface. Each hook widens it with its own actions.
 *
 * `needsSwitch` is kept distinct from a blocked pre-check because it is the one
 * failure the UI can fix for the user with a single button.
 */
export interface WriteMachine {
  stage: WriteStage;
  /** User-facing sentence, or null. Never an empty string. */
  error: string | null;
  needsSwitch: boolean;
  isBusy: boolean;
  /** Hash of the transaction that completes the action, once sent. */
  txHash: `0x${string}` | null;
  reset: () => void;
}

/* ------------------------------------------------------------------ */
/* View-only inspection                                                */
/* ------------------------------------------------------------------ */

/**
 * Run a write hook AS somebody else, without a signer.
 *
 * `simulateContract` takes an `account` and performs an `eth_call` from it, so
 * any address can be simulated by anyone — no key, no signature, no
 * transaction. That is what makes the whole write layer verifiable against real
 * mainnet state: the `/dev/balcore` harness and the panels' view-only mode can
 * ask "what would wallet B's executeWithdraw do right now" and get the chain's
 * actual answer, including its revert.
 *
 * WRITES ARE REFUSED while this is set. There is no signer for an address we
 * merely named, and a hook that silently tried would open the connected
 * wallet and send the wrong person's transaction.
 */
export interface InspectOptions {
  /** Read and dry-run as this address instead of the connected one. */
  inspectAs?: Address;
}

/** The message a write action returns when the hook is in inspect mode. */
export const INSPECT_ONLY_ERROR =
  "This view is inspecting another address, so it cannot sign. Connect that wallet to act.";

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

/**
 * Is the wallet somewhere Balcore does not exist?
 *
 * Two independent questions, and both must be answered or a write goes to the
 * wrong chain: is the APP pointed at mainnet (`BALCORE_DEPLOYED` — there is no
 * testnet deployment at all), and is the WALLET on the chain the app is pointed
 * at.
 *
 * IN INSPECT MODE both answers are yes by construction. There is no wallet, but
 * there is an address to evaluate, and the reads and dry-runs all pin
 * `defaultChain.id` explicitly — so the pre-checks must judge the INSPECTED
 * HOLDER's position rather than stopping at "connect your wallet", or inspecting
 * tells you nothing about the thing you are inspecting. The refusal to sign
 * lives on the actions (`INSPECT_ONLY_ERROR`), which is where it belongs.
 */
export function useBalcoreNetwork(options?: InspectOptions): {
  connected: boolean;
  address: Address | undefined;
  wrongNetwork: boolean;
  /** The chain id every write must pass explicitly. */
  chainId: number;
  /** True when the app itself is not pointed at a network with Balcore on it. */
  notDeployed: boolean;
} {
  const { address, isConnected, chainId } = useAccount();
  const notDeployed = !BALCORE_DEPLOYED || defaultChain.id !== BALCORE_CHAIN_ID;
  const inspecting = Boolean(options?.inspectAs);
  return {
    connected: inspecting || Boolean(isConnected && address),
    address: options?.inspectAs ?? address,
    wrongNetwork: inspecting ? false : Boolean(isConnected && chainId !== defaultChain.id),
    chainId: defaultChain.id,
    notDeployed,
  };
}

/* ------------------------------------------------------------------ */
/* Allowances                                                          */
/* ------------------------------------------------------------------ */

export interface AllowanceRead {
  tokenA: bigint | null;
  usdc: bigint | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Both tokens' allowances to one spender, in a single multicall.
 *
 * `null` rather than `0n` when the read has not landed: the two are different
 * facts, and treating "not yet known" as "no allowance" would make the panel
 * flash an approve step that is not needed.
 */
export function useAllowances(
  owner: Address | undefined,
  spender: Address | undefined,
  tokenA: Address | undefined,
  usdc: Address | undefined,
): AllowanceRead {
  const enabled = Boolean(owner && spender && tokenA && usdc);

  const contracts = useMemo(
    () =>
      enabled
        ? [
            {
              abi: erc20ApprovalAbi,
              address: tokenA as Address,
              functionName: "allowance" as const,
              args: [owner as Address, spender as Address] as const,
              chainId: defaultChain.id,
            },
            {
              abi: erc20ApprovalAbi,
              address: usdc as Address,
              functionName: "allowance" as const,
              args: [owner as Address, spender as Address] as const,
              chainId: defaultChain.id,
            },
          ]
        : [],
    [enabled, owner, spender, tokenA, usdc],
  );

  const read = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled },
  });

  const results = read.data as
    readonly { status: "success" | "failure"; result?: unknown }[] | undefined;

  const at = (i: number): bigint | null => {
    const entry = results?.[i];
    if (!entry || entry.status !== "success") return null;
    return typeof entry.result === "bigint" ? entry.result : null;
  };

  return {
    tokenA: at(0),
    usdc: at(1),
    isLoading: enabled && read.isLoading,
    refetch: read.refetch,
  };
}

/* ------------------------------------------------------------------ */
/* Pre-flight                                                          */
/* ------------------------------------------------------------------ */

/** Anything with a `simulateContract`, i.e. the wagmi public client. */
export interface SimulateCapable {
  simulateContract: (args: never) => Promise<unknown>;
}

/**
 * Dry-run a call and convert a revert into a named, user-facing error.
 *
 * Throws `PreflightError` when the chain genuinely rejected the call, and
 * returns normally in every other case — including when there is no client at
 * all. See the module header: a broken RPC must not read as a broken pool.
 *
 * @param context which write this is, so shared selectors (`ZeroAmount`,
 *        `DepositAlreadyQueued`) get the sentence that fits the screen.
 */
export async function simulateOrThrow(
  client: SimulateCapable | undefined,
  params: unknown,
  account: Address,
  context: WriteContext,
): Promise<void> {
  if (!client) return;
  try {
    await client.simulateContract({ ...(params as object), account } as never);
  } catch (e) {
    if (isRevert(e)) throw new PreflightError(balcoreErrorMessage(e, context));
    // Unreachable or rate-limited node: fall through to the wallet's estimate.
    console.warn("[balcore] pre-flight skipped:", e);
  }
}

/**
 * The message for a caught action error.
 *
 * A `PreflightError` already carries a decoded, context-aware sentence, so it
 * passes through untouched; anything else is run through the decoder (which
 * falls back to the wallet/transport wording when there is no revert data).
 */
export function actionError(e: unknown, context: WriteContext): string {
  if (e instanceof PreflightError) return e.message;
  return balcoreErrorMessage(e, context);
}

/* ------------------------------------------------------------------ */
/* Dry run                                                             */
/* ------------------------------------------------------------------ */

/**
 * The outcome of simulating a write WITHOUT sending it.
 *
 * This is the shape the `/dev/balcore` harness renders. It exists so the whole
 * write layer can be exercised against live mainnet state — real addresses,
 * real balances, real run-mode — with no transaction and no signature. That is
 * how these hooks get verified before anyone points them at a wallet holding
 * money.
 *
 * `reverted` and `failed` are kept apart on purpose: a revert is the contract
 * answering, and a transport failure is us failing to ask. Collapsing them
 * would make a flaky RPC read as a broken pool, which is the same mistake
 * `simulateOrThrow` avoids.
 */
export interface DryRunResult {
  /** "ok" — would succeed. "reverted" — the chain said no, with a reason. */
  outcome: "ok" | "reverted" | "failed" | "skipped";
  /** The exact call that was simulated, for the record. */
  call: { address: string; functionName: string; args: readonly unknown[] } | null;
  /** Decoded revert: selector, name and the user-facing sentence. */
  revert: ReturnType<typeof decodeBalcoreError> | null;
  /** Whatever `simulateContract` returned on success, as a string. */
  result: string | null;
  /** Why nothing was attempted, when outcome is "skipped". */
  note: string | null;
}

/**
 * Simulate a prepared call and report, never throw.
 *
 * Deliberately does NOT reuse `simulateOrThrow`: that function's job is to let
 * transport failures through so the wallet can try anyway, and here a transport
 * failure is a result worth showing rather than something to wave past.
 */
export async function dryRunCall(
  client: SimulateCapable | undefined,
  params: { address: string; functionName: string; args?: readonly unknown[] } | null | undefined,
  account: Address | undefined,
  context: WriteContext,
): Promise<DryRunResult> {
  const call = params
    ? { address: params.address, functionName: params.functionName, args: params.args ?? [] }
    : null;

  if (!params)
    return {
      outcome: "skipped",
      call,
      revert: null,
      result: null,
      note: "nothing to simulate — check the inputs",
    };
  if (!account)
    return {
      outcome: "skipped",
      call,
      revert: null,
      result: null,
      note: "no account: connect a wallet or pass ?address=",
    };
  if (!client)
    return {
      outcome: "skipped",
      call,
      revert: null,
      result: null,
      note: "no public client for this chain",
    };

  try {
    const out = await client.simulateContract({ ...(params as object), account } as never);
    const value = (out as { result?: unknown } | undefined)?.result;
    return {
      outcome: "ok",
      call,
      revert: null,
      result: value === undefined ? "(no return value)" : stringify(value),
      note: null,
    };
  } catch (e) {
    if (isRevert(e)) {
      return {
        outcome: "reverted",
        call,
        revert: decodeBalcoreError(e, context),
        result: null,
        note: null,
      };
    }
    return {
      outcome: "failed",
      call,
      revert: decodeBalcoreError(e, context),
      result: null,
      note: "could not reach the node — this is NOT a contract rejection",
    };
  }
}

/** bigints are not JSON-serialisable; the harness wants to see them anyway. */
function stringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}
