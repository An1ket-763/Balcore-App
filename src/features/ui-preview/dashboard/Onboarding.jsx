import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { LOGO } from "./logo";
import { buildSiweMessage, shortenAddress } from "./walletUtils";

/**
 * Onboarding gate. Nothing of the dashboard is rendered until this flow
 * completes: connect wallet -> sign to verify -> display name -> risk ack.
 * Wallet connection and the signature are real (wagmi); no fake delays.
 */
export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState("connect");
  const [pendingWallet, setPendingWallet] = useState("your wallet");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [signError, setSignError] = useState("");
  const discBodyRef = useRef(null);
  const nameRef = useRef(null);

  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error: connectError } = useConnect();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const short = shortenAddress(address);

  // move to the sign step only once a real connection exists
  useEffect(() => {
    if (isConnected && (step === "pick" || step === "connect")) setStep("sign");
  }, [isConnected, step]);

  useEffect(() => {
    if (step === "name" && nameRef.current) nameRef.current.focus();
  }, [step]);

  const siwe = useMemo(() => {
    if (!address) return null;
    return buildSiweMessage(address, chainId ?? 0);
  }, [address, chainId]);

  /** Map a picker option to an available wagmi connector. */
  function connectorFor(label) {
    const byName = (needle) =>
      connectors.find((c) => c.name.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle));
    if (label === "WalletConnect") return byName("walletconnect");
    if (label === "Coinbase Wallet") return byName("coinbase");
    if (label === "MetaMask") return byName("metamask") ?? byName("injected");
    if (label === "Core") return byName("core") ?? byName("injected");
    if (label === "Rabby") return byName("rabby") ?? byName("injected");
    return byName("injected");
  }

  function pick(label) {
    setPendingWallet(label);
    const connector = connectorFor(label);
    if (!connector) return;
    connect({ connector });
  }

  async function handleSign() {
    if (!siwe) return;
    setSignError("");
    try {
      const signature = await signMessageAsync({ message: siwe.message });
      // TODO: server-side verification still needs to be added — the signature
      // below is NOT verified anywhere yet. A backend endpoint must recover the
      // address from the message + signature and validate/consume the nonce.
      setStep("name");
    } catch (err) {
      setSignError(err?.shortMessage || err?.message || "Signature rejected");
    }
  }

  function finish(displayName) {
    setName(displayName);
    setStep("risk");
  }

  return (
    <div className="onb" id="onb">
      <div className="onb-bg" aria-hidden="true"></div>
      <div className="onb-inner">
        <a className="onb-brand" href="#"><img src={LOGO} alt="" width="30" height="30" /> Balcore</a>

        {/* step 1: connect */}
        <div className="onb-card onb-step" data-step="connect" hidden={step !== "connect"}>
          <h1 className="onb-h">Be the Market Maker</h1>
          <p className="onb-p">Provide liquidity, earn fees, and track your positions. Connect a wallet to get started — self-custodial, your keys stay with you.</p>
          <button className="onb-cta" id="onbConnect" type="button" onClick={() => setStep("pick")}>Connect wallet</button>
          <div className="onb-note">New here? Connecting creates your Balcore profile automatically.</div>
        </div>

        {/* step 2: choose a wallet — real connectors */}
        <div className="onb-card onb-step" data-step="pick" hidden={step !== "pick"}>
          <div className="onb-back-row"><button className="onb-back" data-back="connect" type="button" onClick={() => setStep("connect")}>←</button><h2 className="onb-h2">Choose a wallet</h2></div>
          <div className="wallet-picker">
            <button className="wp-opt" data-wallet="Core" type="button" disabled={isPending} onClick={() => pick("Core")}><span className="wp-ic" style={{background: "#e84142"}}><svg viewBox="0 0 24 24" fill="none"><path d="M12 5.5 19.5 18.5c.3.5-.05 1-.6 1h-3.9c-.35 0-.66-.18-.83-.48l-1.72-3c-.3-.53-1.06-.53-1.36 0l-.5.9c-.3.5-.9.5-1.2 0l-.4-.7c-.2-.35-.2-.8 0-1.15l3.23-6.06c.3-.55 1.08-.55 1.38 0Z" fill="#fff" /><path d="M8.4 15.6c.3-.52.98-.52 1.28 0l1.72 3c.3.5-.05 1-.6 1H7.2c-.56 0-.9-.5-.6-1l1.8-3Z" fill="#fff" /></svg></span><span className="wp-name">Core</span><span className="wp-tag">Avalanche</span></button>
            <button className="wp-opt" data-wallet="MetaMask" type="button" disabled={isPending} onClick={() => pick("MetaMask")}><span className="wp-ic" style={{background: "#f6851b"}}>M</span><span className="wp-name">MetaMask</span><span className="wp-tag">Popular</span></button>
            <button className="wp-opt" data-wallet="Rabby" type="button" disabled={isPending} onClick={() => pick("Rabby")}><span className="wp-ic" style={{background: "#7084ff"}}>R</span><span className="wp-name">Rabby</span><span className="wp-tag">DeFi</span></button>
            <button className="wp-opt" data-wallet="WalletConnect" type="button" disabled={isPending} onClick={() => pick("WalletConnect")}><span className="wp-ic" style={{background: "#3b99fc"}}><svg viewBox="0 0 24 24" fill="none"><path d="M7.2 9.6c2.65-2.6 6.95-2.6 9.6 0l.32.32c.13.13.13.34 0 .47l-1.1 1.08a.17.17 0 0 1-.24 0l-.44-.44c-1.85-1.8-4.85-1.8-6.7 0l-.48.46a.17.17 0 0 1-.24 0L6.82 10.4a.33.33 0 0 1 0-.47l.38-.33Zm11.86 2.2 .98.96c.13.13.13.34 0 .47l-4.42 4.33a.35.35 0 0 1-.48 0l-3.14-3.07a.09.09 0 0 0-.12 0l-3.14 3.07a.35.35 0 0 1-.48 0L4.06 13.23a.33.33 0 0 1 0-.47l.98-.96a.35.35 0 0 1 .48 0l3.14 3.08a.09.09 0 0 0 .12 0l3.14-3.08a.35.35 0 0 1 .48 0l3.14 3.08a.09.09 0 0 0 .12 0l3.14-3.08a.35.35 0 0 1 .48 0Z" fill="#fff" /></svg></span><span className="wp-name">WalletConnect</span><span className="wp-tag">Mobile</span></button>
            <button className="wp-opt" data-wallet="Coinbase Wallet" type="button" disabled={isPending} onClick={() => pick("Coinbase Wallet")}><span className="wp-ic" style={{background: "#0052ff"}}><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#fff" /><rect x="9.1" y="9.1" width="5.8" height="5.8" rx="1.5" fill="#0052ff" /></svg></span><span className="wp-name">Coinbase Wallet</span></button>
          </div>
          {connectError && <div className="onb-note">{connectError.shortMessage || connectError.message}</div>}
        </div>

        {/* step 3: sign to verify ownership — real signature */}
        <div className="onb-card onb-step" data-step="sign" hidden={step !== "sign"}>
          <div className="onb-spinner" id="signSpin"></div>
          <h2 className="onb-h2" id="signTitle">Confirm in <span id="signWallet">{pendingWallet}</span></h2>
          <p className="onb-p">Sign the message to prove you own this wallet. It’s free — no transaction, no gas.</p>
          <div className="sign-box">
            <div className="sign-k">Message</div>
            <div className="sign-msg mono">{`Sign in to Balcore\nAddress: ${short}\nNonce: ${siwe ? siwe.nonce.slice(0, 4) : "—"}… · no funds will move`}</div>
          </div>
          <button className="onb-cta" id="onbSign" type="button" disabled={isSigning || !siwe} onClick={handleSign}>
            {isSigning ? "Waiting for signature…" : "Sign message"}
          </button>
          {signError && <div className="onb-note">{signError}</div>}
        </div>

        {/* step 4: display name */}
        <div className="onb-card onb-step" data-step="name" hidden={step !== "name"}>
          <div className="onb-check">✓</div>
          <h2 className="onb-h2">Wallet connected</h2>
          <p className="onb-p">Pick a display name so you show up as more than an address — on your dashboard and the leaderboard. You can change it anytime.</p>
          <label className="name-field">
            <span className="name-lbl">Display name</span>
            <input ref={nameRef} id="onbName" type="text" maxLength={24} placeholder="e.g. Josh" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="name-hint" id="nameHint">Linked to <span className="mono">{short}</span> · stored by Balcore, visible on the leaderboard.</div>
          <div className="name-actions">
            <button className="onb-ghost" id="onbSkip" type="button" onClick={() => finish("")}>Skip — use address</button>
            <button className="onb-cta onb-cta-sm" id="onbSaveName" type="button" disabled={name.trim().length < 2} onClick={() => finish(name.trim())}>Continue</button>
          </div>
        </div>

        {/* risk acknowledgement — final gate */}
        <div className="onb-card onb-step onb-risk" data-step="risk" hidden={step !== "risk"}>
          <div className="onb-risk-emblem" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l7 2.6v5.2c0 4.6-3 7.9-7 9.2-4-1.3-7-4.6-7-9.2V5.1l7-2.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.6 12.2l2.3 2.3 4.5-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="onb-h2">Market making comes with risks</h2>
          <p className="onb-p">Balcore is built to reduce impermanent loss — but risk is never zero.</p>

          <ul className="onb-risk-list">
            <li><span className="onb-chk"><svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>Balcore is designed to <b>mitigate impermanent loss</b>, but protection is not a guarantee.</span></li>
            <li><span className="onb-chk"><svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span><b>Yield depends on market activity</b> and may be lower than projected.</span></li>
            <li><span className="onb-chk"><svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span><b>Withdrawals follow the protocol settlement cycle</b> and may not be instant.</span></li>
          </ul>

          <button className="onb-risk-disc" id="onbRiskDisc" type="button" aria-expanded={discOpen ? "true" : "false"} aria-controls="onbRiskBody" onClick={() => setDiscOpen((v) => !v)}>
            <span>Full risk disclosure</span>
            <svg className="chev" width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3.5 5l3.5 3.5L10.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="onb-risk-body" id="onbRiskBody" ref={discBodyRef} style={{ maxHeight: discOpen ? (discBodyRef.current?.firstElementChild?.scrollHeight ?? 700) + 20 + "px" : "0px" }}>
            <div className="onb-risk-inner">
              <div className="onb-d"><h3>Smart contract risk</h3><p>Balcore runs on on-chain smart contracts. Even with audits, monitoring, and security practices, contracts can contain bugs or be exposed to exploits.</p></div>
              <div className="onb-d"><h3>Impermanent loss & market risk</h3><p>Balcore mitigates impermanent loss through rules, reserves, and automated positioning. This protection is not a guarantee, and extreme market conditions can still affect your position.</p></div>
              <div className="onb-d"><h3>Yield is variable</h3><p>Displayed APY and fee estimates reflect current or historical market activity. Actual earnings may be higher or lower depending on volume, volatility, fees, and protocol performance.</p></div>
              <div className="onb-d"><h3>Venue & execution risk</h3><p>Balcore market-makes on external venues. Their liquidity, pricing, or downtime can affect how positions execute and what they return.</p></div>
              <div className="onb-d"><h3>Withdrawals follow the settlement cycle</h3><p>Balcore uses structured weekly settlement and withdrawal cycles. Your funds are not locked forever, but withdrawals may take time to settle depending on the protocol schedule and market conditions.</p></div>
              <div className="onb-d"><h3>Self-custody carries responsibility</h3><p>You control your wallet and transactions — always review what you sign. Balcore cannot recover lost private keys, compromised wallets, or mistaken transactions.</p></div>
            </div>
          </div>

          <p className="onb-risk-fine"><b>Only deposit what you understand and are willing to put at risk.</b></p>

          <label className="onb-ack">
            <input type="checkbox" id="onbRiskChk" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="onb-ack-box"><svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <span className="onb-ack-txt">I’ve read and understand these risks.</span>
          </label>
          <button className="onb-cta" id="onbRiskContinue" type="button" disabled={!ack} onClick={() => onComplete(name)}>Continue</button>
        </div>
      </div>
    </div>
  );
}
