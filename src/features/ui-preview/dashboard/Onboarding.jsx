import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectWallet, useLogin, useLogout, usePrivy } from "@privy-io/react-auth";
import { LOGO } from "./logo";
import { shortenAddress } from "./walletUtils";
import { isEmbeddedWalletUser, signInEmail } from "@/lib/privy";

/**
 * Onboarding gate. Nothing of the dashboard is rendered until this flow
 * completes: sign in -> display name -> risk ack.
 *
 * Sign-in goes through Privy, two ways:
 * - email or Google, for people new to crypto: Privy creates a self-custodial
 *   embedded wallet for them, no extension or seed phrase needed;
 * - an existing wallet (Core, MetaMask, Rabby, WalletConnect…): Privy asks the
 *   user to sign a message proving they own it.
 * Either way Privy has verified the user once `authenticated` is true, so the
 * old separate "sign to verify" step is gone.
 */
export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState("connect");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [slowSetup, setSlowSetup] = useState(false);
  const discBodyRef = useRef(null);
  const nameRef = useRef(null);

  const { ready, authenticated, user } = usePrivy();
  const { address } = useAccount();
  const { login } = useLogin({
    onError: (code) => {
      // Closing the modal is a choice, not an error.
      if (code === "exited_auth_flow") return;
      setLoginError("Sign-in didn’t complete. Please try again.");
    },
  });
  const { logout } = useLogout();
  const { connectWallet } = useConnectWallet();

  const short = shortenAddress(address);
  const email = signInEmail(user);
  const embedded = isEmbeddedWalletUser(user);
  // An external-wallet user whose wallet has not reconnected (locked, or
  // switched account). Email/Google users never land here: their wallet is
  // created and unlocked by Privy.
  const needsWalletReconnect = authenticated && !!user?.wallet && !embedded;

  // Signed in with the wallet live in wagmi -> pick a display name.
  // Signed in without a wallet yet -> the embedded wallet is being created,
  // or an external wallet needs unlocking.
  useEffect(() => {
    if (!authenticated) {
      if (step === "setup") setStep("connect");
      return;
    }
    if (address && (step === "connect" || step === "setup")) setStep("name");
    else if (!address && step === "connect") setStep("setup");
  }, [authenticated, address, step]);

  // Offer a way out if account setup stalls.
  useEffect(() => {
    if (step !== "setup") {
      setSlowSetup(false);
      return;
    }
    const t = setTimeout(() => setSlowSetup(true), needsWalletReconnect ? 3000 : 8000);
    return () => clearTimeout(t);
  }, [step, needsWalletReconnect]);

  useEffect(() => {
    if (step === "name" && nameRef.current) nameRef.current.focus();
  }, [step]);

  function startLogin(loginMethods) {
    setLoginError("");
    login({ loginMethods });
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

        {/* step 1: sign in — email/Google or an existing wallet */}
        <div className="onb-card onb-step" data-step="connect" hidden={step !== "connect"}>
          <h1 className="onb-h">Be the Market Maker</h1>
          <p className="onb-p">Provide liquidity, earn fees, and track your positions. Sign in with email or Google and we’ll set up a secure wallet for you — or connect the wallet you already use.</p>
          <button className="onb-cta" id="onbEmail" type="button" disabled={!ready} onClick={() => startLogin(["email", "google"])}>Continue with email or Google</button>
          <button className="onb-cta onb-cta-alt" id="onbConnect" type="button" disabled={!ready} onClick={() => startLogin(["wallet"])}>Connect a wallet</button>
          {loginError
            ? <div className="onb-note" role="alert">{loginError}</div>
            : <div className="onb-note">New here? Signing in creates your Balcore profile automatically. Self-custodial — the wallet is yours.</div>}
        </div>

        {/* step 2: signed in, wallet not live yet */}
        <div className="onb-card onb-step" data-step="setup" hidden={step !== "setup"}>
          {!(needsWalletReconnect && slowSetup) && <div className="onb-spinner" aria-hidden="true"></div>}
          {needsWalletReconnect && slowSetup ? (
            <>
              <h2 className="onb-h2">Reconnect your wallet</h2>
              <p className="onb-p">You’re signed in, but your wallet isn’t connected. Unlock it, or reconnect it below.</p>
              <button className="onb-cta" type="button" onClick={() => connectWallet({ suggestedAddress: user?.wallet?.address })}>Reconnect wallet</button>
              <button className="onb-ghost" type="button" onClick={() => logout()}>Sign out</button>
            </>
          ) : needsWalletReconnect ? (
            <>
              <h2 className="onb-h2">Connecting your wallet</h2>
              <p className="onb-p">Just a moment…</p>
            </>
          ) : embedded ? (
            <>
              <h2 className="onb-h2">Signing you in</h2>
              <p className="onb-p">Just a moment…</p>
              {slowSetup && <button className="onb-ghost" type="button" onClick={() => logout()}>Taking too long? Sign out and try again</button>}
            </>
          ) : (
            <>
              <h2 className="onb-h2">Setting up your account</h2>
              <p className="onb-p">Creating your secure Balcore wallet. This only takes a moment.</p>
              {slowSetup && <button className="onb-ghost" type="button" onClick={() => logout()}>Taking too long? Sign out and try again</button>}
            </>
          )}
        </div>

        {/* step 3: display name */}
        <div className="onb-card onb-step" data-step="name" hidden={step !== "name"}>
          <div className="onb-check">✓</div>
          <h2 className="onb-h2">{embedded ? "You’re in" : "Wallet connected"}</h2>
          <p className="onb-p">Pick a display name so you show up as more than an address — on your dashboard and the leaderboard. You can change it anytime.</p>
          <label className="name-field">
            <span className="name-lbl">Display name</span>
            <input ref={nameRef} id="onbName" type="text" maxLength={24} placeholder="e.g. Josh" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="name-hint" id="nameHint">Linked to {email ? email : <span className="mono">{short}</span>} · stored by Balcore, visible on the leaderboard.</div>
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
