import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { LOGO } from "../logo";
import { LFJ_ICON } from "../lfjIcon";
import { useTokenBalances, USDC_ADDRESS } from "../data/balances";
import { getTokenPrices } from "../data/prices";
import { useSwapQuote } from "../data/swapQuote";
import { defaultChain, isMainnet } from "@/lib/wagmi";
import {
  AVAX_DECIMALS,
  USDC_DECIMALS,
  LB_ROUTER_ADDRESS,
  erc20ApprovalAbi,
  lbRouterAbi,
  swapDeadline,
  type SwapDirection,
} from "@/lib/lfjSwap";

const CHEV = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function fmtAmt(sym: "AVAX" | "USDC", n: number) {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (sym === "USDC") return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function closeSwapOverlay() {
  const btn = document.querySelector<HTMLElement>("#ovSwap [data-close]");
  btn?.click();
}

export default function SwapPanel() {
  const { address, isConnected, chain } = useAccount();
  const { balances, isLoading: balancesLoading } = useTokenBalances();
  const prices = getTokenPrices();

  const [direction, setDirection] = useState<SwapDirection>("USDC_TO_AVAX");
  const [amountIn, setAmountIn] = useState("");
  const [slip, setSlip] = useState(0.5);
  const [customSlip, setCustomSlip] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [flipSpin, setFlipSpin] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isAvaxIn = direction === "AVAX_TO_USDC";
  const fromSym: "AVAX" | "USDC" = isAvaxIn ? "AVAX" : "USDC";
  const toSym: "AVAX" | "USDC" = isAvaxIn ? "USDC" : "AVAX";
  const inDecimals = isAvaxIn ? AVAX_DECIMALS : USDC_DECIMALS;

  const wrongNetwork = isConnected && chain?.id !== defaultChain.id;
  const { quote, amountInWei, isLoading: quoteLoading, isStale, error: quoteError } = useSwapQuote(direction, amountIn);

  const typedAmount = Number((amountIn || "").replace(/,/g, "")) || 0;
  const fromBalance = balances[fromSym] ?? 0;
  const exceedsBalance = typedAmount > 0 && typedAmount > fromBalance;

  // ---- min received / slippage from the REAL quote ----
  const minOutWei = useMemo(() => {
    if (!quote) return 0n;
    const bps = BigInt(Math.round((100 - Math.min(slip, 50)) * 100));
    return (quote.amountOut * bps) / 10_000n;
  }, [quote, slip]);
  const minOutFormatted = minOutWei > 0n ? Number(formatUnits(minOutWei, isAvaxIn ? USDC_DECIMALS : AVAX_DECIMALS)) : 0;

  // ---- sanity check against the (mock) reference prices ----
  const priceWarning = useMemo(() => {
    if (!quote || typedAmount <= 0) return null;
    const liveRate = quote.amountOutFormatted / typedAmount;
    const refRate = (prices[fromSym]?.usd ?? 0) / (prices[toSym]?.usd ?? 1);
    if (!refRate || !Number.isFinite(liveRate) || liveRate <= 0) return null;
    const deviation = Math.abs(liveRate - refRate) / refRate;
    if (deviation > 0.2) {
      return `On-chain rate is ${(deviation * 100).toFixed(0)}% away from our reference price. Double-check before signing.`;
    }
    return null;
  }, [quote, typedAmount, prices, fromSym, toSym]);

  // ---- allowance (only for USDC -> AVAX) ----
  const allowance = useReadContract({
    abi: erc20ApprovalAbi,
    address: USDC_ADDRESS,
    functionName: "allowance",
    args: address ? [address, LB_ROUTER_ADDRESS] : undefined,
    chainId: defaultChain.id,
    query: { enabled: Boolean(address) && !isAvaxIn && isMainnet },
  });
  const needsApproval =
    !isAvaxIn && amountInWei > 0n && (typeof allowance.data === "bigint" ? allowance.data < amountInWei : true);

  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  const swapTx = useWriteContract();
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapTx.data });

  useEffect(() => {
    if (approveReceipt.isSuccess) allowance.refetch();
  }, [approveReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (swapReceipt.isSuccess && !done) {
      setDone(
        `${fmtAmt(fromSym, typedAmount)} ${fromSym} \u2192 ${fmtAmt(toSym, quote?.amountOutFormatted ?? 0)} ${toSym} swapped`,
      );
    }
  }, [swapReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setAmountIn("");
    setDone(null);
    setTxError(null);
    approveTx.reset();
    swapTx.reset();
  }

  function flip() {
    setFlipSpin((v) => !v);
    setDirection(isAvaxIn ? "USDC_TO_AVAX" : "AVAX_TO_USDC");
    setAmountIn("");
    setTxError(null);
  }

  function setPct(pct: number) {
    const amt = (fromBalance * pct) / 100;
    setAmountIn(amt > 0 ? String(Number(amt.toFixed(inDecimals === 6 ? 6 : 8))) : "");
    setTxError(null);
  }

  async function onApprove() {
    setTxError(null);
    try {
      await approveTx.writeContractAsync({
        abi: erc20ApprovalAbi,
        address: USDC_ADDRESS,
        functionName: "approve",
        args: [LB_ROUTER_ADDRESS, amountInWei],
        chainId: defaultChain.id,
      });
    } catch (e) {
      setTxError(e instanceof Error ? shortError(e.message) : "Approval failed");
    }
  }

  async function onSwap() {
    if (!quote || !address) return;
    setTxError(null);
    const path = {
      pairBinSteps: [...quote.path.pairBinSteps],
      versions: [...quote.path.versions],
      tokenPath: [...quote.path.tokenPath],
    } as const;
    try {
      if (isAvaxIn) {
        await swapTx.writeContractAsync({
          abi: lbRouterAbi,
          address: LB_ROUTER_ADDRESS,
          functionName: "swapExactNATIVEForTokens",
          args: [minOutWei, path, address, swapDeadline()],
          value: amountInWei,
          chainId: defaultChain.id,
        });
      } else {
        await swapTx.writeContractAsync({
          abi: lbRouterAbi,
          address: LB_ROUTER_ADDRESS,
          functionName: "swapExactTokensForNATIVE",
          args: [amountInWei, minOutWei, path, address, swapDeadline()],
          chainId: defaultChain.id,
        });
      }
    } catch (e) {
      setTxError(e instanceof Error ? shortError(e.message) : "Swap failed");
    }
  }

  // ---- CTA state machine ----
  const approving = approveTx.isPending || approveReceipt.isLoading;
  const swapping = swapTx.isPending || swapReceipt.isLoading;
  let ctaLabel = "Swap via LFJ";
  let ctaDisabled = false;
  let ctaAction: (() => void) | null = onSwap;

  if (!isMainnet) {
    ctaLabel = "Swap unavailable on testnet";
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
    ctaLabel = `Amount exceeds ${fromSym} balance`;
    ctaDisabled = true;
    ctaAction = null;
  } else if (txError) {
    ctaLabel = txError;
    ctaDisabled = false;
    ctaAction = needsApproval ? onApprove : onSwap;
  } else if (approving) {
    ctaLabel = "Approving USDC\u2026";
    ctaDisabled = true;
    ctaAction = null;
  } else if (swapping) {
    ctaLabel = swapTx.isPending ? "Confirm in wallet\u2026" : "Swapping\u2026";
    ctaDisabled = true;
    ctaAction = null;
  } else if (quoteLoading || isStale) {
    ctaLabel = "Fetching best quote\u2026";
    ctaDisabled = true;
    ctaAction = null;
  } else if (quoteError || !quote) {
    ctaLabel = "No LFJ route for this amount";
    ctaDisabled = true;
    ctaAction = null;
  } else if (needsApproval) {
    ctaLabel = "Approve USDC";
    ctaAction = onApprove;
  }

  const outValue = quote && typedAmount > 0 ? fmtAmt(toSym, quote.amountOutFormatted) : "";
  const liveRate = quote && typedAmount > 0 ? quote.amountOutFormatted / typedAmount : 0;

  const balanceLabel = (sym: "AVAX" | "USDC") => {
    const bal = balances[sym] ?? 0;
    const usd = bal * (prices[sym]?.usd ?? 0);
    return (
      <span className={`mono${balancesLoading ? " is-loading" : ""}`} style={{ color: "var(--text-2)" }}>
        {fmtAmt(sym, bal)} {sym} (${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })})
      </span>
    );
  };

  return (
    <div className="modal">
      <div className="m-head">
        <h2 id="swapTitle">Swap</h2>
        <button className="m-close" data-close={true} aria-label="Close">
          ✕
        </button>
      </div>

      {!done && (
        <>
          <div className="swap-field">
            <div className="swap-field-top">
              <span>You pay</span>
              <span>Balance: {balanceLabel(fromSym)}</span>
            </div>
            <div className="swap-pct" id="swapPct">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} className="swap-pct-btn" type="button" onClick={() => setPct(p)}>
                  {p === 100 ? "Max" : `${p}%`}
                </button>
              ))}
            </div>
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
              <button className="token-pick" id="swapFromTok" type="button" onClick={flip} title="Switch token">
                <span className={fromSym === "AVAX" ? "coin c-avax" : "coin c-usd"}>{fromSym === "AVAX" ? "A" : "$"}</span>
                {fromSym}
                {CHEV}
              </button>
            </div>
            {exceedsBalance && (
              <div className="swap-field-top" role="status" aria-live="polite" style={{ color: "var(--red, #e0554b)" }}>
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
              <span>Balance: {balanceLabel(toSym)}</span>
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
              <button className="token-pick" id="swapToTok" type="button" onClick={flip} title="Switch token">
                <span className={toSym === "AVAX" ? "coin c-avax" : "coin c-usd"}>{toSym === "AVAX" ? "A" : "$"}</span>
                {toSym}
                {CHEV}
              </button>
            </div>
          </div>

          <div className="route-block">
            <div className="route-head">
              <span className="k">Route</span>
              <span className="route-best-tag">
                <span className="live-dot"></span>
                {quoteLoading || isStale ? "Quoting…" : "Live quote"}
              </span>
            </div>
            <div className="route-list" id="routeList">
              <button className="route-opt on is-best" type="button" data-route="lfj">
                <span className="route-ic lfj-ic">
                  <img src={LFJ_ICON} alt="LFJ" />
                </span>
                <span className="route-name">LFJ</span>
                <span className="route-out">{outValue || "—"}</span>
              </button>
            </div>
          </div>

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
            <img src={LOGO} width="15" height="15" alt="" style={{ display: "block", flexShrink: "0", marginTop: "1px" }} />
            <span>Routed via LFJ on Avalanche. Non-custodial.</span>
          </div>

          {!isMainnet && (
            <div className="notice" role="status">
              <span>Swaps run against LFJ's Avalanche mainnet contracts. Set VITE_CHAIN_ENV=mainnet to enable them.</span>
            </div>
          )}

          {priceWarning && (
            <div className="notice" role="alert">
              <span>{priceWarning}</span>
            </div>
          )}

          <button
            className="cta"
            id="swapCta"
            aria-live="polite"
            disabled={ctaDisabled}
            onClick={() => ctaAction?.()}
          >
            {ctaLabel}
          </button>

          <div className={`swap-details${detailsOpen ? " open" : ""}`} id="swapDetails">
            <div className="swap-det-row">
              <span className="swap-det-rate" id="swapDetSummary">
                {liveRate > 0 ? `1 ${fromSym} ≈ ${fmtAmt(toSym, liveRate)} ${toSym}` : `Enter an amount for a live ${fromSym}/${toSym} rate`}
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
                  {liveRate > 0 ? `1 ${fromSym} = ${fmtAmt(toSym, liveRate)} ${toSym}` : "—"}
                </span>
              </div>
              <div className="m-row">
                <span className="k">Routed via</span>
                <span className="v" id="swapVia">
                  LFJ Liquidity Book
                </span>
              </div>
              <div className="m-row">
                <span className="k">Bin step</span>
                <span className="v">
                  {quote ? quote.path.pairBinSteps.map((b) => String(b)).join(", ") : "—"}
                </span>
              </div>
              <div className="m-row">
                <span className="k">Min received</span>
                <span className="v" id="swapMinOut">
                  {minOutFormatted > 0 ? `${fmtAmt(toSym, minOutFormatted)} ${toSym}` : "—"}
                </span>
              </div>
              <div className="m-row">
                <span className="k">Price impact</span>
                <span className="v" id="swapImpact">
                  {quote ? (quote.priceImpactPct < 0.01 ? "<0.01%" : `${quote.priceImpactPct.toFixed(2)}%`) : "—"}
                </span>
              </div>
              <div className="m-row">
                <span className="k">Network</span>
                <span className="v">{defaultChain.name}</span>
              </div>
            </div>
          </div>
          <div className="m-foot">Live LFJ quote, refreshed every 15s. You pay Avalanche gas in AVAX.</div>
        </>
      )}

      {done && (
        <div className="br-done" id="swapDone">
          <div className="bd-ic">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
      )}
    </div>
  );
}

function shortError(msg: string) {
  if (/User rejected|rejected the request|denied/i.test(msg)) return "Rejected in wallet — tap to retry";
  if (/insufficient funds/i.test(msg)) return "Insufficient AVAX for gas — tap to retry";
  if (/slippage|InsufficientAmountOut/i.test(msg)) return "Price moved — raise slippage and retry";
  return "Transaction failed — tap to retry";
}

/** kept for parity with the old imperative helper */
export function parseAmount(value: string, decimals: number) {
  try {
    return parseUnits(value.replace(/,/g, ""), decimals);
  } catch {
    return 0n;
  }
}
