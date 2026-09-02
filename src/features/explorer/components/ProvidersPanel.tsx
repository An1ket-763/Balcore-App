import { LOGO } from "@/features/ui-preview/dashboard/logo";
import { fmt, POOLS, PROVIDERS, type PeriodRecord } from "../data";

export default function ProvidersPanel({
  data,
  block,
  filterAddress,
  onClearFilter,
}: {
  data: PeriodRecord;
  block: number;
  filterAddress: string | null;
  onClearFilter: () => void;
}) {
  const total = data.tvl;
  const pol = Math.round(total * 0.341);
  const users = total - pol;
  const key = filterAddress?.toLowerCase();
  const rows = key ? PROVIDERS.filter((p) => p.fullAddress?.toLowerCase() === key) : PROVIDERS;

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <h2>Liquidity ownership</h2>
            <p>Protocol-owned liquidity and user-provided liquidity</p>
          </div>
        </div>
        <div className="lp-summary">
          <div className="summary-card">
            <div className="l">Total liquidity</div>
            <div className="v">{fmt(total)}</div>
            <div className="s">Across four active pools</div>
            <span className="delta">Block {block.toLocaleString()}</span>
          </div>
          <div className="summary-card">
            <div className="l">Protocol-owned liquidity</div>
            <div className="v violet">{fmt(pol)}</div>
            <div className="s">34.1% · owned by Balcore</div>
            <span className="delta neutral">POL separated</span>
          </div>
          <div className="summary-card">
            <div className="l">User liquidity</div>
            <div className="v mint">{fmt(users)}</div>
            <div className="s">65.9% · attributable to users</div>
            <span className="delta">Wallet indexed</span>
          </div>
          <div className="summary-card">
            <div className="l">Active user LPs</div>
            <div className="v">2,237</div>
            <div className="s">Unique provider wallets</div>
            <span className="delta neutral">4 active pools</span>
          </div>
        </div>
      </div>

      <div className="section ownership">
        <div className="grid2">
          <div className="card">
            <h3>Who owns the liquidity?</h3>
            <div className="sub">
              POL is displayed as one protocol provider. All other rows belong to user wallets.
            </div>
            <div className="owner-bar">
              <span style={{ width: "34.1%", background: "var(--violet)" }}>POL 34.1%</span>
              <span style={{ width: "65.9%", background: "var(--mint)" }}>USERS 65.9%</span>
            </div>
            <details className="card-more">
              <summary>What each side is</summary>
              <div className="more-body">
                <div className="owner-notes">
                  <div className="owner-note">
                    <b className="violet">Balcore POL</b>
                    <p>
                      Permanent capital funded by Balcore Inc — used to seed markets and deepen
                      quotes. Never user deposits, never surplus.
                    </p>
                  </div>
                  <div className="owner-note">
                    <b className="mint">User LP capital</b>
                    <p>
                      Capital supplied by individual wallets. Each position remains attributable to
                      its on-chain owner.
                    </p>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div className="card">
            <h3>What POL is used for</h3>
            <div className="sub">
              Protocol-owned liquidity supports market quality without hiding who owns the capital.
            </div>
            <details className="card-more">
              <summary>See the three uses</summary>
              <div className="more-body">
                <div className="pol-use">
                  <div className="use-row">
                    <span className="use-n">1</span>
                    <div>
                      <b>Seed new pools</b>
                      <p>Launches a market with usable depth before external LP participation grows.</p>
                    </div>
                  </div>
                  <div className="use-row">
                    <span className="use-n">2</span>
                    <div>
                      <b>Deepen two-sided quotes</b>
                      <p>Adds durable inventory where the engine needs more execution capacity.</p>
                    </div>
                  </div>
                  <div className="use-row">
                    <span className="use-n">3</span>
                    <div>
                      <b>Align the protocol</b>
                      <p>Balcore earns and absorbs market outcomes alongside external providers.</p>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
        <div className="card">
          <h3>Who earned the fees?</h3>
          <div className="sub">
            Cumulative LP-side income since launch, split between protocol-owned liquidity and user
            wallets. Both figures are reconstructed from settlement events, wallet by wallet.
          </div>
          <div className="owner-bar">
            <span style={{ width: "25.4%", background: "var(--violet)" }}>POL $1.28M · 25.4%</span>
            <span style={{ width: "74.6%", background: "var(--mint)" }}>USERS $3.74M · 74.6%</span>
          </div>
          <details className="card-more">
            <summary>Returns per side</summary>
            <div className="more-body">
              <div className="owner-notes">
                <div className="owner-note">
                  <b className="violet">Balcore POL earned $1,276,400</b>
                  <p>34.1% of the liquidity → 25.4% of LP income · 15.2% cumulative return on its capital.</p>
                </div>
                <div className="owner-note">
                  <b className="mint">User LPs earned $3,742,800</b>
                  <p>65.9% of the liquidity → 74.6% of LP income · 23.1% cumulative return on their capital.</p>
                </div>
              </div>
              <div className="sub" style={{ marginTop: 10 }}>
                Users hold two-thirds of the liquidity and take three-quarters of the income — the
                settlement order pays user capital before the protocol's own.
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

export function ProviderTable({
  filterAddress,
  onClearFilter,
}: {
  filterAddress: string | null;
  onClearFilter: () => void;
}) {
  const key = filterAddress?.toLowerCase();
  const rows = key ? PROVIDERS.filter((p) => p.fullAddress?.toLowerCase() === key) : PROVIDERS;

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <h2>All liquidity providers</h2>
          <p>{key ? "One wallet isolated from the provider registry" : "One POL provider, followed by user wallets"}</p>
        </div>
      </div>
      <div className={`provider-filter${key ? " show" : ""}`}>
        <span>
          Provider table filtered to <code>{filterAddress ?? ""}</code>
        </span>
        <button className="btn" onClick={onClearFilter}>
          Show all providers
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Type</th>
              <th>Liquidity</th>
              <th>Share</th>
              <th>Fees earned</th>
              <th>Positions</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p, i) => (
                <tr key={p.fullAddress}>
                  <td>
                    <div className="provider">
                      <span className={`avatar ${p.type === "POL" ? "pol" : ""}`}>
                        {p.type === "POL" ? (
                          <img className="avatar-logo" src={LOGO} alt="Balcore logo" />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>
                        <b>{p.name}</b>
                        <small>{p.fullAddress?.startsWith("0x") ? p.fullAddress : p.address}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${p.type === "POL" ? "pol" : "user"}`}>{p.type}</span>
                  </td>
                  <td className="mono">{fmt(p.liq)}</td>
                  <td className="mono">{p.share}</td>
                  <td className="mono">{fmt(p.fees)}</td>
                  <td className="mono">{p.pos}</td>
                  <td>{p.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="no-results">
                  No provider record for this wallet in the index.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PoolGrid() {
  return (
    <div className="section">
      <div className="section-head">
        <div>
          <h2>Ownership by pool</h2>
          <p>POL and user capital shown separately</p>
        </div>
      </div>
      <div className="pool-grid">
        {POOLS.map((p) => {
          const pp = (p.pol / p.total) * 100;
          const up = 100 - pp;
          return (
            <div className="pool-card" key={p.name}>
              <div className="pool-head">
                <b>{p.name}</b>
                <span>{p.providers.toLocaleString()} user LPs</span>
              </div>
              <div className="pool-total">{fmt(p.total)}</div>
              <div className="pool-split">
                <span style={{ width: `${pp}%`, background: "var(--violet)" }} />
                <span style={{ width: `${up}%`, background: "var(--mint)" }} />
              </div>
              <div className="pool-rows">
                <div className="pool-row">
                  <span>Balcore POL</span>
                  <span>
                    {fmt(p.pol)} · {pp.toFixed(1)}%
                  </span>
                </div>
                <div className="pool-row">
                  <span>User liquidity</span>
                  <span>
                    {fmt(p.users)} · {up.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
