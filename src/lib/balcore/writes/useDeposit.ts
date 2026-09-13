/**
 * Depositing into a Balcore pool.
 *
 * THE SHAPE OF THE THING, because it is not the usual "approve then deposit":
 * `BalCoreBank.deposit(btcbAmount, usdcAmount)` takes BOTH tokens, and it
 * reverts unless their values match within 1% at the live Chainlink price
 * (`VaultMath.checkDepositRatio`, VaultMath.sol:810). There is no one-sided
 * deposit and no per-side minimum on the user — the $200-a-side figure that
 * appears in the protocol docs is `minPositionValueB`, the sequencer's floor for
 * DEPLOYING a reserve into the LP, and it has nothing to do with what a user may
 * put in.
 *
 * So the hook supports two modes:
 *
 *   both      — the user supplies both legs; we pin the second to the first.
 *   usdcOnly  — the user supplies USDC; we sell half of it for tokenA first,
 *               then deposit the pair. That first leg is a real swap through a
 *               real router, which is why `swapping` is a stage and not a
 *               detail: it is a separate transaction that costs money and can
 *               fail on its own.
 *
 * Three approvals can be needed, to TWO DIFFERENT SPENDERS: USDC to the swap
 * router (usdcOnly only), then tokenA and USDC to the **BANK**. The bank is
 * what calls `safeTransferFrom` (BalCoreBank.sol:534-535) — approving the vault
 * would leave the deposit reverting on allowance with everything looking right.
 *
 * Every transaction dry-runs through `simulateContract` before the wallet opens.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, type Address, type Hex } from "viem";
import { defaultChain } from "@/lib/wagmi";
import { erc20ApprovalAbi, LB_ROUTER_ADDRESS, lbRouterAbi, swapDeadline } from "@/lib/lfjSwap";
import { PHARAOH_SWAP_ROUTER, buildPharaohSwap, pharaohRouterAbi } from "@/lib/pharaohSwap";
import { USDC, tokenBySymbol, type SwapToken } from "@/lib/tokens";
import { useRouteQuotes, type RouteQuote } from "@/features/ui-preview/dashboard/data/swapQuote";
import { balcoreBankAbi } from "../abi/bank";
import { balcoreVaultAbi } from "../abi/vault";
import { poolByKey, type BalcorePool, type PoolKey } from "../config/addresses";
import { matchedAmount } from "../math";
import {
  checkDeposit,
  minTokenAForPairing,
  splitUsdcForDeposit,
  valueDeposit,
  type CheckResult,
  type DepositMode,
  type DepositValuation,
  type UsdcSplit,
} from "./checks";
import {
  actionError,
  isBusyStage,
  planDepositStages,
  simulateOrThrow,
  useAllowances,
  useBalcoreNetwork,
  dryRunCall,
  INSPECT_ONLY_ERROR,
  type DryRunResult,
  type InspectOptions,
  type WriteMachine,
  type WriteStage,
} from "./shared";

/* ------------------------------------------------------------------ */
/* Inputs and shape                                                    */
/* ------------------------------------------------------------------ */

export interface DepositInput {
  mode: DepositMode;
  /** tokenA in its own smallest unit. Ignored in `usdcOnly`. */
  tokenAAmount: bigint;
  /** USDC in 6-dec atoms. In `usdcOnly` this is the WHOLE amount. */
  usdcAmount: bigint;
  /**
   * The price the caller's amounts were matched at, when it is not the live
   * one. Drives the drift warning.
   */
  quotedPrice8?: bigint | null;
}

export interface DepositHook extends WriteMachine {
  pool: BalcorePool | undefined;
  /** Pre-checks, recomputed on every read. `ok === false` disables the CTA. */
  checks: CheckResult;
  /** The two legs' values and whether they pair. */
  valuation: DepositValuation;
  /**
   * The LIVE Chainlink answer, 8 decimals — the price `deposit` checks the ±1%
   * pairing at. Match amounts off THIS, never off the anchor. 0n until read, or
   * when the feed reports a non-positive answer.
   */
  price8: bigint;
  /**
   * `vault.lastValidPrice()` — the deviation anchor, and what the bank's views
   * value positions at. Exposed so a panel can show how far the two have
   * drifted, not for matching.
   */
  anchoredPrice8: bigint;
  /** usdcOnly: how the USDC divides, and what the swap must deliver. */
  split: UsdcSplit | null;
  /** The legs that will actually be deposited (after the split, in usdcOnly). */
  legs: { tokenA: bigint; usdc: bigint };
  /** The connected (or inspected) wallet's balances, in each token's atoms. */
  walletBalances: { tokenA: bigint; usdc: bigint };

  /** The matched-amount calculator, at the live price. */
  matchTokenAForUsdc: (usdc: bigint) => bigint;
  matchUsdcForTokenA: (tokenA: bigint) => bigint;

  needsApproval: { tokenA: boolean; usdc: boolean; swapRouter: boolean };
  /** The ordered stages this deposit needs, approvals already satisfied omitted. */
  plan: WriteStage[];

  /** usdcOnly: the route the split swap would take, and its quote. */
  swapRoute: RouteQuote | null;
  swapQuoting: boolean;

  switchNetwork: () => void;
  approveTokenA: () => Promise<void>;
  approveUsdc: () => Promise<void>;
  approveSwapRouter: () => Promise<void>;
  /** usdcOnly: sell half the USDC for tokenA. */
  swap: () => Promise<void>;
  deposit: () => Promise<void>;
  /** Simulate the deposit without sending anything. Used by the dev harness. */
  dryRun: () => Promise<DryRunResult>;
}

/* ------------------------------------------------------------------ */
/* Pool reads                                                          */
/* ------------------------------------------------------------------ */

const I = {
  anchoredPrice: 0,
  totalAssets: 1,
  tvlCap: 2,
  tvlCapActive: 3,
  paused: 4,
  positions: 5,
  currentEpoch: 6,
  tokenABalance: 7,
  usdcBalance: 8,
  feedRound: 9,
} as const;

/** `balanceOf`, the one ERC-20 read `erc20ApprovalAbi` does not carry. */
const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Chainlink's aggregator read.
 *
 * Hand-written, like `lfjSwap.ts`'s `erc20ApprovalAbi` and `contracts.ts`'s own
 * Chainlink fragment: this is the AggregatorV3Interface standard, not a Balcore
 * contract, so `extract-abi.sh` has no artifact for it.
 */
const chainlinkFeedAbi = [
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

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useDeposit(
  key: PoolKey,
  input: DepositInput,
  options?: InspectOptions,
): DepositHook {
  const pool = poolByKey(key);
  const account = useAccount();
  const address = options?.inspectAs ?? account.address;
  const readOnly = Boolean(options?.inspectAs);
  const isConnected = readOnly ? true : account.isConnected;
  const { switchChain } = useSwitchChain();
  const net = useBalcoreNetwork(options);
  const publicClient = usePublicClient({ chainId: defaultChain.id });

  const [stage, setStage] = useState<WriteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  /** tokenA actually received by the split swap, once it confirms. */
  const [swappedTokenA, setSwappedTokenA] = useState<bigint | null>(null);

  const ready = Boolean(pool && address && isConnected && !net.notDeployed);

  /* ---- pool + wallet state ---- */
  const contracts = useMemo(() => {
    if (!pool || !address) return [];
    const bank = { abi: balcoreBankAbi, address: pool.bank, chainId: defaultChain.id } as const;
    return [
      {
        abi: balcoreVaultAbi,
        address: pool.vault,
        chainId: defaultChain.id,
        functionName: "lastValidPrice",
      },
      { ...bank, functionName: "totalAssets" },
      { ...bank, functionName: "LAUNCH_TVL_CAP" },
      { ...bank, functionName: "tvlCapActive" },
      { ...bank, functionName: "paused" },
      { ...bank, functionName: "positions", args: [address] as const },
      { ...bank, functionName: "currentEpoch" },
      {
        abi: erc20BalanceAbi,
        address: pool.tokenA.address,
        chainId: defaultChain.id,
        functionName: "balanceOf",
        args: [address] as const,
      },
      {
        abi: erc20BalanceAbi,
        address: pool.tokenB.address,
        chainId: defaultChain.id,
        functionName: "balanceOf",
        args: [address] as const,
      },
      // THE PRICE THE DEPOSIT IS ACTUALLY CHECKED AT. See `price8` below.
      {
        abi: chainlinkFeedAbi,
        address: pool.feed,
        chainId: defaultChain.id,
        functionName: "latestRoundData",
      },
    ];
  }, [pool, address]);

  const reads = useReadContracts({
    contracts: contracts as never,
    allowFailure: true,
    query: { enabled: ready },
  });

  const r = reads.data as
    readonly { status: "success" | "failure"; result?: unknown }[] | undefined;
  const big = (i: number): bigint => {
    const e = r?.[i];
    return e?.status === "success" && typeof e.result === "bigint" ? e.result : 0n;
  };
  const bool = (i: number): boolean => {
    const e = r?.[i];
    return e?.status === "success" && e.result === true;
  };

  /**
   * THE ANCHOR, not the price. `vault.lastValidPrice()` is whatever the last
   * state-changing call wrote; the trader uses it only as the deviation
   * reference (BalCoreVault.sol:1190-1198). It is the right number for VALUING
   * a position, because the bank's own views price against it — and the wrong
   * number for pairing a deposit.
   */
  const anchoredPrice8 = big(I.anchoredPrice);

  /**
   * THE PRICE THE ±1% CHECK IS ACTUALLY RUN AT: the live Chainlink answer.
   *
   * `BalCoreBank.deposit` calls `TRADER.fetchAndCheckPrice()` (BalCoreBank.sol:484),
   * which does a FRESH `latestRoundData()` read and returns that — the anchor is
   * only consulted to bound the move. So a form that matches its two legs off
   * `lastValidPrice()` matches them at a stale number and the chain then rejects
   * the pair.
   *
   * THIS IS NOT THEORETICAL. Caught by the dry-run harness on 2026-09-13: the
   * anchor read $78,167.36 while the feed read $77,138.59, a gap of 1.330% —
   * outside the ±1% tolerance — and a "matched" $100 pair simulated straight
   * into `DepositRatioOutOfBounds`, the chain valuing the tokenA leg at $98.68.
   * Matched off the live answer the same pair values at $99.999388, 0.0006% out.
   *
   * A negative or zero answer is treated as no price: `_readValidatedPrice`
   * reverts `StalePriceData` on `answer <= 0` (VaultViewLib.sol:153), so there is
   * nothing to match against either.
   */
  const price8 = (() => {
    const e = r?.[I.feedRound];
    if (e?.status !== "success" || !Array.isArray(e.result)) return 0n;
    const answer = (e.result as readonly unknown[])[1];
    return typeof answer === "bigint" && answer > 0n ? answer : 0n;
  })();

  const tokenABalance = big(I.tokenABalance);
  const usdcBalance = big(I.usdcBalance);

  // `positions` returns (shares, entryEpoch, lastClaimedEpoch, queuedBtcb,
  // queuedUsdc, activated, depositTimestamp). The one-queued-deposit guard is
  // `(queuedBtcb > 0 || queuedUsdc > 0) && entryEpoch >= currentEpoch`
  // (BalCoreBank.sol:529) — an ACTIVATED user's stale queued fields must not
  // lock them out, which is the AB-1 fix, so the epoch half is not optional.
  const posTuple = (() => {
    const e = r?.[I.positions];
    return e?.status === "success" && Array.isArray(e.result)
      ? (e.result as readonly unknown[])
      : null;
  })();
  const tupleBig = (t: readonly unknown[] | null, at: number): bigint =>
    typeof t?.[at] === "bigint" ? (t[at] as bigint) : 0n;

  const hasQueuedDeposit =
    (tupleBig(posTuple, 3) > 0n || tupleBig(posTuple, 4) > 0n) &&
    tupleBig(posTuple, 1) >= big(I.currentEpoch);

  /* ---- the usdcOnly split ---- */
  const split = useMemo<UsdcSplit | null>(() => {
    if (input.mode !== "usdcOnly") return null;
    if (!pool || price8 <= 0n) return null;
    return splitUsdcForDeposit(input.usdcAmount, price8, pool.scaleA2B);
  }, [input.mode, input.usdcAmount, pool, price8]);

  /**
   * The legs that reach `deposit`.
   *
   * In usdcOnly the tokenA leg is what the swap ACTUALLY delivered once it has
   * confirmed, and only the target before that. Using the target after the fact
   * would deposit an amount the wallet may not hold.
   */
  const legs = useMemo(() => {
    if (input.mode === "both") {
      return { tokenA: input.tokenAAmount, usdc: input.usdcAmount };
    }
    if (!split) return { tokenA: 0n, usdc: 0n };
    return { tokenA: swappedTokenA ?? split.targetTokenA, usdc: split.keepUsdc };
  }, [input.mode, input.tokenAAmount, input.usdcAmount, split, swappedTokenA]);

  /* ---- allowances: the bank, and the router for the split ---- */
  const bankAllowances = useAllowances(
    address,
    pool?.bank,
    pool?.tokenA.address,
    pool?.tokenB.address,
  );

  /* ---- the split swap's route ---- */
  const tokenAToken: SwapToken = useMemo(
    () =>
      tokenBySymbol(pool?.tokenA.symbol === "WAVAX" ? "AVAX" : (pool?.tokenA.symbol ?? "BTC.b")),
    [pool?.tokenA.symbol],
  );
  const swapAmountStr = useMemo(
    () => (split && split.swapUsdc > 0n ? formatUnits(split.swapUsdc, USDC.decimals) : ""),
    [split],
  );
  const quotes = useRouteQuotes(USDC, tokenAToken, swapAmountStr, 0.5, address);

  /**
   * Only the two on-chain DEX routes are used for the split.
   *
   * Kyber and Odos need a server round-trip to assemble calldata, and wiring
   * that in here would duplicate `SwapPanel`'s aggregator assembly for a leg
   * that is, by construction, half of one deposit. Pharaoh and LFJ quote and
   * execute entirely on chain through `pharaohSwap.ts` / `lfjSwap.ts`, which is
   * what this hook reuses. A user who wants an aggregated fill can swap in the
   * Swap panel and then deposit in `both` mode — and the copy says so.
   */
  const swapRoute = useMemo<RouteQuote | null>(() => {
    const candidates = [quotes.byId.pharaoh, quotes.byId.lfj].filter(
      (q) => q.status === "ok" && q.amountOut !== null && q.amountOut > 0n,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, q) =>
      (q.amountOut ?? 0n) > (best.amountOut ?? 0n) ? q : best,
    );
  }, [quotes.byId.pharaoh, quotes.byId.lfj]);

  const swapSpender = swapRoute?.spender;
  const swapAllowanceRead = useReadContracts({
    contracts: (address && swapSpender && pool
      ? [
          {
            abi: erc20ApprovalAbi,
            address: pool.tokenB.address,
            chainId: defaultChain.id,
            functionName: "allowance",
            args: [address, swapSpender] as const,
          },
        ]
      : []) as never,
    allowFailure: true,
    query: { enabled: Boolean(address && swapSpender && pool) },
  });
  const swapAllowance = (() => {
    const e = (
      swapAllowanceRead.data as
        readonly { status: "success" | "failure"; result?: unknown }[] | undefined
    )?.[0];
    return e?.status === "success" && typeof e.result === "bigint" ? e.result : null;
  })();

  /* ---- checks ---- */
  const valuation = useMemo(
    () =>
      valueDeposit({
        tokenAAmount: legs.tokenA,
        usdcAmount: legs.usdc,
        price8,
        scaleA2B: pool?.scaleA2B ?? 1n,
      }),
    [legs.tokenA, legs.usdc, price8, pool?.scaleA2B],
  );

  const checks = useMemo<CheckResult>(
    () =>
      checkDeposit({
        mode: input.mode,
        tokenAAmount: legs.tokenA,
        usdcAmount: legs.usdc,
        tokenABalance,
        usdcBalance,
        price8,
        scaleA2B: pool?.scaleA2B ?? 1n,
        pricingTvl: big(I.totalAssets),
        tvlCap: big(I.tvlCap),
        tvlCapActive: bool(I.tvlCapActive),
        hasQueuedDeposit,
        paused: bool(I.paused),
        poolLive: pool?.status === "live",
        connected: net.connected,
        wrongNetwork: net.wrongNetwork,
        quotedPrice8: input.quotedPrice8 ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.mode,
      input.quotedPrice8,
      legs.tokenA,
      legs.usdc,
      tokenABalance,
      usdcBalance,
      price8,
      pool,
      hasQueuedDeposit,
      net.connected,
      net.wrongNetwork,
      r,
    ],
  );

  const needsApproval = {
    tokenA: legs.tokenA > 0n && (bankAllowances.tokenA ?? 0n) < legs.tokenA,
    usdc: legs.usdc > 0n && (bankAllowances.usdc ?? 0n) < legs.usdc,
    swapRouter:
      input.mode === "usdcOnly" &&
      (split?.swapUsdc ?? 0n) > 0n &&
      (swapAllowance ?? 0n) < (split?.swapUsdc ?? 0n),
  };

  const plan = useMemo(
    () =>
      planDepositStages({
        mode: input.mode,
        tokenAAmount: legs.tokenA,
        usdcAmount: legs.usdc,
        tokenAAllowance: bankAllowances.tokenA ?? 0n,
        usdcAllowance: bankAllowances.usdc ?? 0n,
        swapAllowance: swapAllowance ?? 0n,
        swapUsdc: split?.swapUsdc ?? 0n,
      }),
    [
      input.mode,
      legs.tokenA,
      legs.usdc,
      bankAllowances.tokenA,
      bankAllowances.usdc,
      swapAllowance,
      split?.swapUsdc,
    ],
  );

  /* ---- transactions ---- */
  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveTx.data,
    chainId: defaultChain.id,
  });
  const swapTx = useWriteContract();
  const [swapHash, setSwapHash] = useState<Hex | null>(null);
  const swapReceipt = useWaitForTransactionReceipt({
    hash: swapHash ?? undefined,
    chainId: defaultChain.id,
  });
  const depositTx = useWriteContract();
  const depositReceipt = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: defaultChain.id,
  });

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      bankAllowances.refetch();
      swapAllowanceRead.refetch();
      setStage("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  /**
   * Read back what the swap actually delivered, rather than trusting the quote.
   *
   * The quote is pre-trade and the fill is post-trade; depositing the quoted
   * amount would, on any adverse move, try to transfer tokenA the wallet does
   * not have. `balanceOf` after the receipt is the only honest number.
   */
  useEffect(() => {
    if (!swapReceipt.isSuccess || !publicClient || !pool || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const held = (await publicClient.readContract({
          abi: erc20BalanceAbi,
          address: pool.tokenA.address,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        if (cancelled) return;
        // Cap at what pairs with the kept USDC: a swap that overshot should not
        // push the deposit out of the ±1% band in the other direction.
        const target = split?.targetTokenA ?? 0n;
        setSwappedTokenA(held < target ? held : target);
        setStage("idle");
      } catch {
        if (!cancelled) setStage("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapReceipt.isSuccess]);

  useEffect(() => {
    if (depositReceipt.isSuccess) setStage("done");
  }, [depositReceipt.isSuccess]);

  /* ---- actions ---- */
  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setTxHash(null);
    setSwapHash(null);
    setSwappedTokenA(null);
    approveTx.reset();
    swapTx.reset();
    depositTx.reset();
  }, [approveTx, swapTx, depositTx]);

  const switchNetwork = useCallback(() => {
    switchChain({ chainId: defaultChain.id });
  }, [switchChain]);

  /** One approval, to one spender, for exactly the amount needed. */
  const approve = useCallback(
    async (token: Address, spender: Address, amount: bigint, nextStageName: WriteStage) => {
      if (amount <= 0n) return;
      if (readOnly) {
        setStage("error");
        setError(INSPECT_ONLY_ERROR);
        return;
      }
      setError(null);
      setStage(nextStageName);
      try {
        await approveTx.writeContractAsync({
          abi: erc20ApprovalAbi,
          address: token,
          functionName: "approve",
          // Exactly the amount, never unlimited: the bank holds this allowance
          // between deposits and an unlimited one is a standing claim on the
          // user's wallet for a contract they may never use again.
          args: [spender, amount],
          chainId: defaultChain.id,
        });
      } catch (e) {
        setStage("error");
        setError(actionError(e, "approve"));
      }
    },
    [approveTx, readOnly],
  );

  const approveTokenA = useCallback(async () => {
    if (!pool) return;
    await approve(pool.tokenA.address, pool.bank, legs.tokenA, "approvingTokenA");
  }, [pool, approve, legs.tokenA]);

  const approveUsdc = useCallback(async () => {
    if (!pool) return;
    await approve(pool.tokenB.address, pool.bank, legs.usdc, "approvingUsdc");
  }, [pool, approve, legs.usdc]);

  const approveSwapRouter = useCallback(async () => {
    if (!pool || !swapSpender || !split) return;
    await approve(pool.tokenB.address, swapSpender, split.swapUsdc, "approvingUsdc");
  }, [pool, swapSpender, split, approve]);

  /** The split swap: half the USDC into tokenA, through Pharaoh or LFJ. */
  const swap = useCallback(async () => {
    if (!pool || !address || !split || split.swapUsdc <= 0n) return;
    if (readOnly) {
      setStage("error");
      setError(INSPECT_ONLY_ERROR);
      return;
    }
    if (!swapRoute) {
      setStage("error");
      setError(
        "No on-chain route for that size right now. Swap to the pool's asset in the Swap panel, then deposit both tokens.",
      );
      return;
    }

    // Min-out is sized off the PAIRING RULE, not off a slippage preference:
    // the deposit that follows must land inside ±1% of the kept USDC, and a
    // swap that fills below that leaves the user holding tokenA and a deposit
    // that reverts. 50 bps of extra headroom covers the price moving between
    // this transaction and the next.
    const minOut = minTokenAForPairing(split.keepUsdc, price8, pool.scaleA2B, 50n);
    const quoted = swapRoute.amountOut ?? 0n;
    const floor = minOut > quoted ? quoted : minOut;

    const deadline = swapDeadline();
    const params =
      swapRoute.id === "pharaoh"
        ? (() => {
            if (swapRoute.pharaohTickSpacing == null) return null;
            const call = buildPharaohSwap({
              tokenIn: pool.tokenB.address,
              tokenOut: pool.tokenA.address,
              tickSpacing: swapRoute.pharaohTickSpacing,
              amountIn: split.swapUsdc,
              amountOutMinimum: floor,
              recipient: address,
              deadline,
              unwrapToNative: false,
            });
            return {
              abi: pharaohRouterAbi,
              address: PHARAOH_SWAP_ROUTER,
              functionName: call.functionName,
              args: call.args,
              chainId: defaultChain.id,
            } as const;
          })()
        : (() => {
            if (!swapRoute.lfjPath) return null;
            return {
              abi: lbRouterAbi,
              address: LB_ROUTER_ADDRESS,
              functionName: "swapExactTokensForTokens",
              args: [
                split.swapUsdc,
                floor,
                {
                  pairBinSteps: [...swapRoute.lfjPath.pairBinSteps],
                  versions: [...swapRoute.lfjPath.versions],
                  tokenPath: [...swapRoute.lfjPath.tokenPath],
                },
                address,
                deadline,
              ],
              chainId: defaultChain.id,
            } as const;
          })();

    if (!params) {
      setStage("error");
      setError("That route expired while you were looking at it. Try again.");
      return;
    }

    setError(null);
    setStage("swapping");
    try {
      await simulateOrThrow(publicClient, params, address, "swap");
      const hash = await swapTx.writeContractAsync(params as never);
      setSwapHash(hash);
    } catch (e) {
      setStage("error");
      setError(actionError(e, "swap"));
    }
  }, [pool, address, split, swapRoute, price8, publicClient, swapTx, readOnly]);

  /** The deposit itself. */
  const depositParams = useMemo(() => {
    if (!pool) return null;
    return {
      abi: balcoreBankAbi,
      address: pool.bank,
      functionName: "deposit",
      args: [legs.tokenA, legs.usdc] as const,
      chainId: defaultChain.id,
    } as const;
  }, [pool, legs.tokenA, legs.usdc]);

  const deposit = useCallback(async () => {
    if (!depositParams || !address) return;
    if (readOnly) {
      setStage("error");
      setError(INSPECT_ONLY_ERROR);
      return;
    }
    setError(null);
    setStage("preparing");
    try {
      await simulateOrThrow(publicClient, depositParams, address, "deposit");
      setStage("signing");
      const hash = await depositTx.writeContractAsync(depositParams as never);
      setTxHash(hash);
      setStage("confirming");
    } catch (e) {
      setStage("error");
      setError(actionError(e, "deposit"));
    }
  }, [depositParams, address, publicClient, depositTx, readOnly]);

  const dryRun = useCallback(
    () => dryRunCall(publicClient, depositParams, address, "deposit"),
    [publicClient, depositParams, address],
  );

  const isBusy =
    isBusyStage(stage) ||
    approveReceipt.isLoading ||
    swapReceipt.isLoading ||
    depositReceipt.isLoading;

  return {
    pool,
    stage,
    error,
    needsSwitch: net.wrongNetwork,
    isBusy,
    txHash,
    checks,
    valuation,
    price8,
    anchoredPrice8,
    split,
    legs,
    walletBalances: { tokenA: tokenABalance, usdc: usdcBalance },
    matchTokenAForUsdc: (usdc: bigint) =>
      pool ? matchedAmount({ usdc }, price8, pool.scaleA2B) : 0n,
    matchUsdcForTokenA: (tokenA: bigint) =>
      pool ? matchedAmount({ tokenA }, price8, pool.scaleA2B) : 0n,
    needsApproval,
    plan,
    swapRoute,
    swapQuoting: quotes.isQuoting,
    switchNetwork,
    approveTokenA,
    approveUsdc,
    approveSwapRouter,
    swap,
    deposit,
    dryRun,
    reset,
  };
}
