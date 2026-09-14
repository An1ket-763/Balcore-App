# Balcore App

The Balcore dashboard: provide liquidity, earn fees, and track your market-making positions on Avalanche.

## Routes

- `/` — the dashboard (wallet onboarding, overview, deposit, withdraw, swap, bridge)
- `/explorer` — Balcore Explorer, proof of liquidity

## Development

You need Node.js and npm.

```sh
npm i
npm run dev
```

Copy `.env.example` to `.env` and fill in the values. Every variable is documented in that file.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run format` — Prettier
