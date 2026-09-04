import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useEstimateFeesPerGas,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { LOGO } from "../logo";
import { LFJ_ICON } from "../lfjIcon";
import { balanceOf, rawBalanceOf, useSwapBalances } from "../data/swapBalances";
import { getTokenPrices } from "../data/prices";
import { useRouteQuotes, type RouteId, type RouteQuote } from "../data/swapQuote";
import { gasReserveWei, portionOf, spendableNative } from "@/lib/gasReserve";
import { PreflightError, isRevert } from "@/lib/txPreflight";
import { defaultChain, isMainnet } from "@/lib/wagmi";
import { LB_ROUTER_ADDRESS, erc20ApprovalAbi, lbRouterAbi, swapDeadline } from "@/lib/lfjSwap";
import { PHARAOH_SWAP_ROUTER, buildPharaohSwap, pharaohRouterAbi } from "@/lib/pharaohSwap";
import { assembleOdosTx, buildKyberTx } from "@/lib/aggregatorApi";
import {
  AVAX,
  SWAP_TOKENS,
  USDC,
  formatTokenAmount,
  sameToken,
  type SwapToken,
} from "@/lib/tokens";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CHEV = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
    <path
      d="M3 4.5 6 7.5 9 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Tile glyphs, matching the original route list. LFJ keeps its wordmark. */
function RouteIcon({ id }: { id: RouteId }) {
  if (id === "lfj") {
    return (
      <span className="route-ic lfj-ic">
        <img src={LFJ_ICON} alt="" />
      </span>
    );
  }
  const glyph = id === "pharaoh" ? "\u{1F53A}" : id === "kyber" ? "\u{1F300}" : "◎";
  return (
    <span className="route-ic" aria-hidden="true">
      {glyph}
    </span>
  );
}

function closeSwapOverlay() {
  const btn = document.querySelector<HTMLElement>("#ovSwap [data-close]");
  btn?.click();
}

type Side = "in" | "out";

/** The wagmi-configured read client, once it exists. */
type ChainClient = NonNullable<ReturnType<typeof usePublicClient>>;

/**
 * A swap that has been fully built but not yet signed, split so the same call
 * can be dry-run against the chain and then sent through the wallet.
 */
interface RoutePlan {
  simulate: (client: ChainClient) => Promise<unknown>;
  send: () => Promise<Hex>;
}

export default function SwapPanel() {
  const { address, isConnected, chain } = useAccount();
  const { balances, raw: rawBalances, isLoading: balancesLoading } = useSwapBalances();
  const prices = getTokenPrices();
  const publicClient = usePublicClient({ chainId: defaultChain.id });

  const [tokenIn, setTokenIn] = useState<SwapToken>(USDC);
  const [tokenOut, setTokenOut] = useState<SwapToken>(AVAX);
  const [amountIn, setAmountIn] = useState("");
  const [slip, setSlip] = useState(0.5);
  const [customSlip, setCustomSlip] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [flipSpin, setFlipSpin] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /** Route the user explicitly picked; null means "follow the best price". */
  const [pinnedRoute, setPinnedRoute] = useState<RouteId | null>(null);
  const [swapHash, setSwapHash] = useState<Hex | null>(null);
  /** Covers the aggregator round-trip that happens before the wallet prompt. */
  const [preparing, setPreparing] = useState(false);
  const [openPicker, setOpenPicker] = useState<Side | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  const wrongNetwork = isConnected && chain?.id !== defaultChain.id;

  const { routes, byId, bestId, amountInWei, isQuoting, isStale, allFailed } = useRouteQuotes(
    tokenIn,
    tokenOut,
    amountIn,
    slip,
    address,
  );

  // A pinned route that stops quoting silently hands control back to the best
  // price rather than leaving the panel stuck on a dead tile.
  const selectedId: RouteId | null =
    pinnedRoute && byId[pinnedRoute]?.status === "ok" ? pinnedRoute : bestId;
  const selected: RouteQuote | null = selectedId ? byId[selectedId] : null;
  const overriding = Boolean(
    pinnedRoute && selectedId === pinnedRoute && bestId && pinnedRoute !== bestId,
  );

  const typedAmount = Number((amountIn || "").replace(/,/g, "")) || 0;
  const fromBalance = balanceOf(balances, tokenIn);
  const fromBalanceWei = rawBalanceOf(rawBalances, tokenIn);

  // ---- native gas reserve ----
  // Spending the whole AVAX balance can never work: the swap sends it as
  // `value`, leaving nothing to pay the fee with. Reserve a fee-aware slice.
  const fees = useEstimateFeesPerGas({
    chainId: defaultChain.id,
    query: { enabled: isConnected, refetchInterval: 30_000 },
  });
  const gasReserve = useMemo(
    () => gasReserveWei(fees.data?.maxFeePerGas ?? fees.data?.gasPrice ?? null),
    [fees.data],
  );
  /** What the selected input token can actually put into a swap. */
  const spendableWei = tokenIn.native
    ? spendableNative(fromBalanceWei, gasReserve)
    : fromBalanceWei;

  // Compared in the token's own units, so an 18-decimal amount is not judged
  // through a float that has already lost the low-order digits.
  const exceedsBalance = amountInWei > 0n && amountInWei > fromBalanceWei;
  const leavesNoGas =
    tokenIn.native &&
    amountInWei > 0n &&
    amountInWei <= fromBalanceWei &&
    amountInWei > spendableWei;

  const usdFor = (token: SwapToken): number | null =>
    token.priceKey ? (prices[token.priceKey]?.usd ?? null) : null;

  // ---- min received / slippage, from whichever route is selected ----
  const minOutWei = useMemo(() => {
    if (!selected?.amountOut) return 0n;
    const bps = BigInt(Math.round((100 - Math.min(slip, 50)) * 100));
    return (selected.amountOut * bps) / 10_000n;
  }, [selected, slip]);
  const minOutFormatted = minOutWei > 0n ? Number(formatUnits(minOutWei, tokenOut.decimals)) : 0;

  /**
   * Sanity check, derived from the routes themselves.
   *
   * The old version compared the live rate against `prices.ts`, which is still
   * mock data — so it fired on every single swap and meant nothing. Four
   * independent quotes for the same swap are a far better reference than a
   * hardcoded price, and need no feed at all: if they disagree wildly, one
   * source is stale or broken and that IS worth stopping for.
   */
  const routeWarning = useMemo(() => {
    const outs = routes
      .filter((r) => r.status === "ok" && r.amountOutFormatted !== null)
      .map((r) => r.amountOutFormatted as number)
      .filter((n) => n > 0);
    if (outs.length < 2) return null;
    const best = Math.max(...outs);
    const worst = Math.min(...outs);
    if (best <= 0) return null;
    const spreadPct = ((best - worst) / best) * 100;
    if (spreadPct > 10) {
      return `Quotes disagree by ${spreadPct.toFixed(0)}% across routes — one source may be stale. Check the amount before signing.`;
    }
    return null;
  }, [routes]);

  /** How far the selected route falls behind the best one, in percent. */
  const behindBestPct = useMemo(() => {
    if (!selected?.amountOutFormatted || !bestId) return 0;
    const bestOut = byId[bestId]?.amountOutFormatted;
    if (!bestOut || bestOut <= 0) return 0;
    const behind = ((bestOut - selected.amountOutFormatted) / bestOut) * 100;
    return behind > 0 ? behind : 0;
  }, [selected, bestId, byId]);

  // ---- allowance, against the selected route's own spender ----
  const spender = selected?.spender ?? null;
  const spenderKnown = Boolean(spender && spender !== ZERO_ADDRESS);
  const needsErc20 = !tokenIn.native;
  const allowance = useReadContract({
    abi: erc20ApprovalAbi,
    address: tokenIn.address,
    functionName: "allowance",
    args: address && spenderKnown ? [address, spender as Address] : undefined,
    chainId: defaultChain.id,
    query: { enabled: Boolean(address) && spenderKnown && needsErc20 && isMainnet },
  });
  const needsApproval =
    needsErc20 &&
    amountInWei > 0n &&
    spenderKnown &&
    (typeof allowance.data === "bigint" ? allowance.data < amountInWei : true);

  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const contractSwap = useWriteContract();
  const rawSwap = useSendTransaction();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapHash ?? undefined });

  useEffect(() => {
    if (approveReceipt.isSuccess) allowance.refetch();
  }, [approveReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (swapReceipt.isSuccess && !done) {
      setDone(
        `${formatTokenAmount(tokenIn, typedAmount)} ${tokenIn.symbol} → ${formatTokenAmount(tokenOut, selected?.amountOutFormatted ?? 0)} ${tokenOut.symbol} swapped via ${selected?.name ?? "Balcore"}`,
      );
    }
  }, [swapReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing either side invalidates any manual route choice.
  useEffect(() => {
    setPinnedRoute(null);
  }, [tokenIn, tokenOut]);

  // Close the token dropdown on an outside click or Escape.
  useEffect(() => {
    if (!openPicker) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target as Node)) {
        setOpenPicker(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPicker(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [openPicker]);

  function reset() {
    setAmountIn("");
    setDone(null);
    setTxError(null);
    setSwapHash(null);
    setPinnedRoute(null);
    approveTx.reset();
    contractSwap.reset();
    rawSwap.reset();
  }

  function flip() {
    setFlipSpin((v) => !v);
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setTxError(null);
    setSwapHash(null);
  }

  /** Picking the token already on the other side swaps the pair instead. */
  function pickToken(side: Side, token: SwapToken) {
    setOpenPicker(null);
    setTxError(null);
    setSwapHash(null);
    if (side === "in") {
      if (sameToken(token, tokenOut)) setTokenOut(tokenIn);
      setTokenIn(token);
      setAmountIn("");
    } else {
      if (sameToken(token, tokenIn)) setTokenIn(tokenOut);
      setTokenOut(token);
    }
  }

  /**
   * Percentage buttons work in the token's smallest unit and floor.
   *
   * The float path this replaced rounded to 8 decimal places, which on an
   * 18-decimal token can round UP past the real balance (1.234567895 becomes
   * 1.23456790) and produce a Max the wallet cannot cover. For native AVAX the
   * percentage is taken of the spendable balance, not the whole one, so Max
   * still leaves enough behind to pay for its own gas.
   */
  function setPct(pct: number) {
    const amt = portionOf(spendableWei, pct);
    if (amt <= 0n) {
      setAmountIn("");
      setTxError(null);
      return;
    }
    setAmountIn(formatUnits(amt, tokenIn.decimals));
    setTxError(null);
  }

  async function onApprove() {
    if (!spenderKnown) return;
    setTxError(null);
    try {
      await approveTx.writeContractAsync({
        abi: erc20ApprovalAbi,
        address: tokenIn.address,
        functionName: "approve",
        args: [spender as Address, amountInWei],
        chainId: defaultChain.id,
      });
    } catch (e) {
      setTxError(e instanceof Error ? shortError(e.message) : "Approval failed");
    }
  }

  async function onSwap() {
    if (!selected || !address || selected.status !== "ok" || !selected.amountOut) return;
    setTxError(null);
    setPreparing(true);
    try {
      const plan = await prepareRoute(selected);
      // Dry-run against the chain before the wallet ever opens. A route whose
      // path has moved, whose pool has emptied, or whose allowance is short
      // reverts here — costing nothing — instead of after the user has signed.
      await simulate(plan);
      const hash = await plan.send();
      setSwapHash(hash);
    } catch (e) {
      // A pre-flight failure already carries a specific, user-facing reason;
      // shortError would flatten it back into "Transaction failed".
      if (e instanceof PreflightError) setTxError(e.message);
      else setTxError(e instanceof Error ? shortError(e.message) : "Swap failed");
    } finally {
      setPreparing(false);
    }
  }

  /**
   * Run the prepared call as an `eth_call` first.
   *
   * Only a genuine revert blocks the swap. An unreachable or rate-limited RPC
   * must not: the check exists to catch bad transactions, and turning it into
   * a hard gate would make a flaky node look like a broken swap panel. In that
   * case the wallet does its own estimate, exactly as it did before.
   */
  async function simulate(plan: RoutePlan): Promise<void> {
    if (!publicClient) return;
    try {
      await plan.simulate(publicClient);
    } catch (e) {
      if (isRevert(e)) throw new PreflightError(revertMessage(e));
      console.warn("[balcore] swap pre-flight skipped:", e);
    }
  }

  async function prepareRoute(route: RouteQuote): Promise<RoutePlan> {
    const user = address as Address;
    const deadline = swapDeadline();
    const nativeValue = tokenIn.native ? amountInWei : 0n;

    if (route.id === "lfj") {
      if (!route.lfjPath) throw new Error("LFJ route expired");
      const path = {
        pairBinSteps: [...route.lfjPath.pairBinSteps],
        versions: [...route.lfjPath.versions],
        tokenPath: [...route.lfjPath.tokenPath],
      } as const;
      if (tokenIn.native) {
        const params = {
          abi: lbRouterAbi,
          address: LB_ROUTER_ADDRESS,
          functionName: "swapExactNATIVEForTokens",
          args: [minOutWei, path, user, deadline],
          value: amountInWei,
          chainId: defaultChain.id,
        } as const;
        return {
          simulate: (client) => client.simulateContract({ ...params, account: user }),
          send: () => contractSwap.writeContractAsync(params),
        };
      }
      if (tokenOut.native) {
        const params = {
          abi: lbRouterAbi,
          address: LB_ROUTER_ADDRESS,
          functionName: "swapExactTokensForNATIVE",
          args: [amountInWei, minOutWei, path, user, deadline],
          chainId: defaultChain.id,
        } as const;
        return {
          simulate: (client) => client.simulateContract({ ...params, account: user }),
          send: () => contractSwap.writeContractAsync(params),
        };
      }
      const params = {
        abi: lbRouterAbi,
        address: LB_ROUTER_ADDRESS,
        functionName: "swapExactTokensForTokens",
        args: [amountInWei, minOutWei, path, user, deadline],
        chainId: defaultChain.id,
      } as const;
      return {
        simulate: (client) => client.simulateContract({ ...params, account: user }),
        send: () => contractSwap.writeContractAsync(params),
      };
    }

    if (route.id === "pharaoh") {
      if (route.pharaohTickSpacing == null) throw new Error("Pharaoh route expired");
      const call = buildPharaohSwap({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        tickSpacing: route.pharaohTickSpacing,
        amountIn: amountInWei,
        amountOutMinimum: minOutWei,
        recipient: user,
        deadline,
        unwrapToNative: tokenOut.native,
      });
      if (call.functionName === "multicall") {
        const params = {
          abi: pharaohRouterAbi,
          address: PHARAOH_SWAP_ROUTER,
          functionName: "multicall",
          args: call.args,
          value: nativeValue,
          chainId: defaultChain.id,
        } as const;
        return {
          simulate: (client) => client.simulateContract({ ...params, account: user }),
          send: () => contractSwap.writeContractAsync(params),
        };
      }
      const params = {
        abi: pharaohRouterAbi,
        address: PHARAOH_SWAP_ROUTER,
        functionName: "exactInputSingle",
        args: call.args,
        value: nativeValue,
        chainId: defaultChain.id,
      } as const;
      return {
        simulate: (client) => client.simulateContract({ ...params, account: user }),
        send: () => contractSwap.writeContractAsync(params),
      };
    }

    // Both aggregators hand back raw calldata, so the dry run is a plain
    // eth_call rather than a typed contract simulation. Note the tx is
    // assembled fresh here, not reused from quote time — an expired
    // routeSummary or pathId fails at the API with its own message.
    if (route.id === "kyber") {
      if (!route.kyber) throw new Error("KyberSwap route expired");
      const tx = await buildKyberTx({
        routeSummary: route.kyber.routeSummary,
        routerAddress: route.kyber.routerAddress,
        sender: user,
        recipient: user,
        slippageBps: Math.round(Math.min(slip, 50) * 100),
        deadline,
        nativeValue,
      });
      return rawPlan(tx, user);
    }

    if (!route.odos) throw new Error("Odos route expired");
    const tx = await assembleOdosTx({ pathId: route.odos.pathId, userAddr: user });
    return rawPlan(tx, user);
  }

  /** Shared plan for the two aggregators, which both return ready calldata. */
  function rawPlan(
    tx: { to: Address; data: Hex; value: bigint; gas?: bigint },
    user: Address,
  ): RoutePlan {
    return {
      simulate: (client) =>
        client.call({ account: user, to: tx.to, data: tx.data, value: tx.value }),
      send: () =>
        rawSwap.sendTransactionAsync({
          to: tx.to,
          data: tx.data,
          value: tx.value,
          ...(tx.gas ? { gas: tx.gas } : {}),
          chainId: defaultChain.id,
        }),
    };
  }

  // ---- CTA state machine ----
  const approving = approveTx.isPending || approveReceipt.isLoading;
  const swapping =
    preparing || contractSwap.isPending || rawSwap.isPending || swapReceipt.isLoading;
  const walletPending = contractSwap.isPending || rawSwap.isPending;
  let ctaLabel = selected ? `Swap via ${selected.name}` : "Swap";
  let ctaDisabled = false;
  let ctaAction: (() => void) | null = onSwap;

  if (!isMainnet) {
    ctaLabel = "Swap unavailable on testnet";
    ctaDisabled = true;
    ctaAction = null;
  } else if (sameToken(tokenIn, tokenOut)) {
    ctaLabel = "Pick two different tokens";
    ctaDisabled = true;
    ctaAction = null;
  } else if (!isConnected) {
    ctaLabel = "Connect your wallet";
    ctaDisabled = true;
    ctaAction = null;
  } else if (wrongNetwork) {
    ctaLabel = `Switch to ${defaultChain.name}`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (typedAmount <= 0) {
    ctaLabel = "Enter an amount";
    ctaDisabled = true;
    ctaAction = null;
  } else if (exceedsBalance) {
    ctaLabel = `Amount exceeds ${tokenIn.symbol} balance`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (leavesNoGas) {
    // Spending this much AVAX would leave nothing to pay the fee with, so the
    // transaction cannot be signed however good the quote is.
    ctaLabel = `Leave ~${formatTokenAmount(AVAX, Number(formatUnits(gasReserve, 18)))} AVAX for gas`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (txError) {
    ctaLabel = txError;
    ctaDisabled = false;
    ctaAction = needsApproval ? onApprove : onSwap;
  } else if (approving) {
    ctaLabel = `Approving ${tokenIn.symbol}…`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (swapping) {
    ctaLabel = walletPending ? "Confirm in wallet…" : preparing ? "Building swap…" : "Swapping…";
    ctaDisabled = true;
    ctaAction = null;
  } else if (isQuoting || isStale) {
    ctaLabel = "Comparing routes…";
    ctaDisabled = true;
    ctaAction = null;
  } else if (allFailed || !selected) {
    ctaLabel = `No route for ${tokenIn.symbol} → ${tokenOut.symbol}`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (needsApproval) {
    ctaLabel = `Approve ${tokenIn.symbol} for ${selected.name}`;
    ctaAction = onApprove;
  }

  const outValue =
    selected?.amountOutFormatted && typedAmount > 0
      ? formatTokenAmount(tokenOut, selected.amountOutFormatted)
      : "";
  const liveRate =
    selected?.amountOutFormatted && typedAmount > 0 ? selected.amountOutFormatted / typedAmount : 0;
  const scanning = amountInWei > 0n && (isQuoting || isStale);

  const balanceLabel = (token: SwapToken) => {
    const bal = balanceOf(balances, token);
    const usd = usdFor(token);
    return (
      <span
        className={`mono${balancesLoading ? " is-loading" : ""}`}
        style={{ color: "var(--text-2)" }}
      >
        {formatTokenAmount(token, bal)} {token.symbol}
        {usd === null
          ? ""
          : ` ($${(bal * usd).toLocaleString("en-US", { maximumFractionDigits: 2 })})`}
      </span>
    );
  };

  const routeOutLabel = (route: RouteQuote) => {
    if (route.status === "ok" && route.amountOutFormatted !== null) {
      return formatTokenAmount(tokenOut, route.amountOutFormatted);
    }
    if (route.status === "loading") return "…";
    return "—";
  };

  const tokenPicker = (side: Side, token: SwapToken) => {
    const open = openPicker === side;
    return (
      <div className="token-pick-wrap" ref={open ? pickerWrapRef : undefined}>
        <button
          className="token-pick"
          id={side === "in" ? "swapFromTok" : "swapToTok"}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpenPicker(open ? null : side)}
        >
          <span className={`coin ${token.coinClass}`}>{token.badge}</span>
          {token.symbol}
          {CHEV}
        </button>
        <div
          className={`token-menu${open ? " open" : ""}`}
          role="listbox"
          aria-label={side === "in" ? "Token to pay" : "Token to receive"}
        >
          {SWAP_TOKENS.map((t) => {
            const isSelected = sameToken(t, token);
            return (
              <button
                key={t.symbol}
                className={`token-menu-item${isSelected ? " sel" : ""}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                title={t.label}
                onClick={() => pickToken(side, t)}
              >
                <span className={`coin ${t.coinClass}`}>{t.badge}</span>
                <span className="tmi-name">{t.symbol}</span>
                <span className="tmi-sym">{formatTokenAmount(t, balanceOf(balances, t))}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="modal swap-modal">
      <div className="m-head">
        <h2 id="swapTitle">Swap</h2>
        <button className="m-close" data-close={true} aria-label="Close">
          ✕
        </button>
      </div>

      {!done && (
        <>
          <div className="swap-body">
            <div className="swap-field">
              <div className="swap-field-top">
                <span>You pay</span>
                <span>Balance: {balanceLabel(tokenIn)}</span>
              </div>
              <div className="swap-pct" id="swapPct">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className="swap-pct-btn"
                    type="button"
                    onClick={() => setPct(p)}
                    title={
                      p === 100 && tokenIn.native
                        ? `Leaves ~${formatTokenAmount(AVAX, Number(formatUnits(gasReserve, 18)))} AVAX for gas`
                        : undefined
                    }
                  >
                    {p === 100 ? "Max" : `${p}%`}
                  </button>
                ))}
              </div>
              {tokenIn.native && fromBalanceWei > 0n && (
                <div
                  className="swap-field-note"
                  style={{ color: "var(--text-2)", fontSize: "11px" }}
                >
                  Max keeps ~{formatTokenAmount(AVAX, Number(formatUnits(gasReserve, 18)))} AVAX
                  back for gas.
                </div>
              )}
              <div className="swap-field-row">
                <input
                  id="swapFrom"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Amount to pay"
                  value={amountIn}
                  onChange={(e) => {
                    setAmountIn(e.target.value.replace(/[^0-9.]/g, ""));
                    setTxError(null);
                  }}
                />
                {tokenPicker("in", tokenIn)}
              </div>
              {exceedsBalance && (
                <div
                  className="swap-field-top"
                  role="status"
                  aria-live="polite"
                  style={{ color: "var(--red, #e0554b)" }}
                >
                  <span>Amount exceeds wallet balance</span>
                </div>
              )}
            </div>

            <div className="swap-mid">
              <button
                className={`swap-flip${flipSpin ? " spin" : ""}`}
                id="swapFlip"
                aria-label="Flip tokens"
                type="button"
                onClick={flip}
              >
                <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
                  <path
                    d="M5.5 3v9M5.5 12 3 9.5M5.5 12 8 9.5M11.5 14V5M11.5 5 9 7.5M11.5 5 14 7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className="swap-field">
              <div className="swap-field-top">
                <span>You receive</span>
                <span>Balance: {balanceLabel(tokenOut)}</span>
              </div>
              <div className="swap-field-row">
                <input
                  id="swapTo"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Amount to receive"
                  readOnly={true}
                  value={outValue}
                />
                {tokenPicker("out", tokenOut)}
              </div>
            </div>

            <div className="route-block">
              <div className="route-head">
                <span className="k">Route</span>
                <span className="route-best-tag" aria-live="polite">
                  {scanning ? (
                    <>
                      <span className="scan-spinner"></span>Comparing routes…
                    </>
                  ) : (
                    <>
                      <span className="live-dot"></span>
                      {overriding ? "Manual route" : "Best price"}
                    </>
                  )}
                </span>
              </div>
              <div
                className={`route-list${scanning ? " scanning" : ""}`}
                id="routeList"
                role="group"
                aria-label="Swap route"
              >
                {routes.map((route) => {
                  const isSelected = route.id === selectedId;
                  const quoted = route.status === "ok";
                  return (
                    <button
                      key={route.id}
                      type="button"
                      className={[
                        "route-opt",
                        isSelected ? "on" : "",
                        route.id === bestId ? "is-best" : "",
                        quoted ? "scan-hit" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-route={route.id}
                      aria-pressed={isSelected}
                      disabled={!quoted}
                      title={route.error ?? route.detail ?? route.name}
                      onClick={() => setPinnedRoute(route.id)}
                    >
                      <RouteIcon id={route.id} />
                      <span className="route-name">{route.name}</span>
                      <span className="route-out">{routeOutLabel(route)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {overriding && (
              <div className="notice" role="status">
                <span>
                  Using {selected?.name} —{" "}
                  {behindBestPct > 0.01
                    ? `${behindBestPct.toFixed(2)}% less than `
                    : "same price as "}
                  {bestId ? byId[bestId].name : "the best route"}.{" "}
                  <button
                    type="button"
                    className="swap-det-link"
                    onClick={() => setPinnedRoute(null)}
                    style={{ padding: 0 }}
                  >
                    Use best price
                  </button>
                </span>
              </div>
            )}

            <div className="slip-block">
              <div className="slip-head">
                <span className="slip-label">Max slippage</span>
                <span className="slip-val" id="slipVal">
                  {slip}%
                </span>
              </div>
              <div className="slip-opts" id="slipOpts">
                {[0.1, 0.5, 1].map((s) => (
                  <button
                    key={s}
                    className={`slip-opt${slip === s && !customSlip ? " on" : ""}`}
                    type="button"
                    onClick={() => {
                      setSlip(s);
                      setCustomSlip("");
                    }}
                  >
                    {s}%
                  </button>
                ))}
                <div className="slip-custom">
                  <input
                    id="slipCustom"
                    inputMode="decimal"
                    placeholder="Custom"
                    aria-label="Custom slippage percent"
                    value={customSlip}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                      setCustomSlip(raw);
                      const val = parseFloat(raw);
                      if (!Number.isNaN(val) && val > 0) setSlip(Math.min(val, 50));
                    }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>

            <div className="notice green">
              <img
                src={LOGO}
                width="15"
                height="15"
                alt=""
                style={{ display: "block", flexShrink: "0", marginTop: "1px" }}
              />
              <span>
                Balcore quotes Pharaoh, KyberSwap, Odos and LFJ on every amount and routes through
                whichever fills best. Non-custodial.
              </span>
            </div>

            {!isMainnet && (
              <div className="notice" role="status">
                <span>
                  Swaps run against Avalanche mainnet contracts. Set VITE_CHAIN_ENV=mainnet to
                  enable them.
                </span>
              </div>
            )}

            {routeWarning && (
              <div className="notice" role="alert">
                <span>{routeWarning}</span>
              </div>
            )}

            <div className={`swap-details${detailsOpen ? " open" : ""}`} id="swapDetails">
              <div className="swap-det-row">
                <span className="swap-det-rate" id="swapDetSummary">
                  {liveRate > 0
                    ? `1 ${tokenIn.symbol} ≈ ${formatTokenAmount(tokenOut, liveRate)} ${tokenOut.symbol}`
                    : `Enter an amount for a live ${tokenIn.symbol}/${tokenOut.symbol} rate`}
                </span>
                <button
                  className="swap-det-link"
                  id="swapDetToggle"
                  type="button"
                  aria-expanded={detailsOpen}
                  aria-controls="swapDetBody"
                  onClick={() => setDetailsOpen((v) => !v)}
                >
                  {detailsOpen ? "Hide details" : "Show details"}
                </button>
              </div>
              <div className="swap-rows m-rows swap-det-body" id="swapDetBody">
                <div className="m-row">
                  <span className="k">Rate</span>
                  <span className="v" id="swapRate">
                    {liveRate > 0
                      ? `1 ${tokenIn.symbol} = ${formatTokenAmount(tokenOut, liveRate)} ${tokenOut.symbol}`
                      : "—"}
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Routed via</span>
                  <span className="v" id="swapVia">
                    {selected?.name ?? "—"}
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Route detail</span>
                  <span className="v">{selected?.detail ?? "—"}</span>
                </div>
                <div className="m-row">
                  <span className="k">Min received</span>
                  <span className="v" id="swapMinOut">
                    {minOutFormatted > 0
                      ? `${formatTokenAmount(tokenOut, minOutFormatted)} ${tokenOut.symbol}`
                      : "—"}
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Price impact</span>
                  <span className="v" id="swapImpact">
                    {selected?.priceImpactPct == null
                      ? "—"
                      : selected.priceImpactPct < 0.01
                        ? "<0.01%"
                        : `${selected.priceImpactPct.toFixed(2)}%`}
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Est. network fee</span>
                  <span className="v">
                    {selected?.gasUsd == null
                      ? "—"
                      : `$${selected.gasUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  </span>
                </div>
                <div className="m-row">
                  <span className="k">Network</span>
                  <span className="v">{defaultChain.name}</span>
                </div>
              </div>
            </div>
            <div className="m-foot">
              All four routes requote every 15s. You pay Avalanche gas in AVAX.
            </div>
          </div>

          <div className="swap-actions">
            <button
              className="cta"
              id="swapCta"
              aria-live="polite"
              disabled={ctaDisabled}
              onClick={() => ctaAction?.()}
            >
              {ctaLabel}
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="swap-body">
          <div className="br-done" id="swapDone">
            <div className="bd-ic">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5 10 17.5 19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Swap complete</h3>
            <div className="bd-amt" id="swapDoneAmt">
              {done}
            </div>
            <button
              className="cta"
              id="swapDoneClose"
              onClick={() => {
                closeSwapOverlay();
                reset();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Turn a simulated revert into something the CTA can actually say. */
function revertMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason ?? "";
      if (/InsufficientAmountOut|TooLittleReceived|Too little received/i.test(name)) {
        return "Price moved — raise slippage and retry";
      }
      if (name) return `Swap would fail: ${name} — tap to retry`;
    }
  }
  const msg = err instanceof Error ? err.message : "";
  if (/insufficient allowance|TRANSFER_FROM_FAILED|STF/i.test(msg)) {
    return "Approval is short — approve again and retry";
  }
  if (/transfer amount exceeds|insufficient balance/i.test(msg)) {
    return "Balance moved — lower the amount and retry";
  }
  return "Swap would fail on-chain — tap to retry";
}

function shortError(msg: string) {
  if (/User rejected|rejected the request|denied/i.test(msg))
    return "Rejected in wallet — tap to retry";
  if (/insufficient funds/i.test(msg)) return "Insufficient AVAX for gas — tap to retry";
  if (/slippage|InsufficientAmountOut|Too little received/i.test(msg))
    return "Price moved — raise slippage and retry";
  if (/timed out|unreachable|unexpected router/i.test(msg)) return msg;
  return "Transaction failed — tap to retry";
}
