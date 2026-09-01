export default function Hero() {
  return (
    <section className="hero">
      <div>
        <div className="eyebrow">Protocol transparency</div>
        <h1>See the liquidity. Verify the proof.</h1>
        <p>
          A clear view of what Balcore holds, what the engine earns, what LPs receive, and who owns
          the liquidity. Every important number opens its reconstruction path.
        </p>
        <div className="hero-custody">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3 4.5 6v5.2c0 4.6 3.2 8.1 7.5 9.8 4.3-1.7 7.5-5.2 7.5-9.8V6L12 3Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="m8.8 12 2.3 2.3 4.1-4.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <b>Built for public verification.</b> The production explorer reconstructs every figure
            from Avalanche contract reads, indexed events and oracle-priced balances.
          </span>
        </div>
        <div className="hero-custody">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>
            <b>Self-custody by design.</b> Asset owners control deposits and withdrawals. Balcore’s
            engine manages market-making logic inside the protocol and is compensated from realized
            market-making fees.
          </span>
        </div>
        <div className="prototype-note">
          <span>
            <b>Illustrative prototype data.</b> Live movement on this page is simulated. Production
            connects these views to Avalanche RPC, Balcore indexer events and oracle-priced balances.
          </span>
        </div>
      </div>
    </section>
  );
}
