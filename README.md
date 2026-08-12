# Wallet Connect Hub

Make a new react (tsx) + tailwind and custom css project of this html file.
By default i want the connect wallet page the ui should not be visible until user connects their wallet.
Integrate real wallet connection into the Balcore dashboard preview at
src/features/ui-preview/dashboard/, replacing the fake "connect wallet"
UI with a working implementation. Scope: wallet connection only — do not
touch dashboard.css, UiView.css, or any other visual/styling code.

1. INSTALL
   npm install wagmi viem @rainbow-me/rainbowkit @tanstack/react-query

2. WAGMI CONFIG
   Create src/lib/wagmi.ts. Configure chains with Avalanche (avalancheFuji
   or avalanche mainnet — ask me which) as the primary/default chain.
   Include Ethereum, Base, Arbitrum, and Polygon as additional supported
   chains (these are used later for a USDC bridge feature, but for now
   just make them available in the config). Use RainbowKit's
   getDefaultConfig() with WalletConnect projectId as an env variable
   (VITE_WALLETCONNECT_PROJECT_ID) — do not hardcode it, add it to
   .env.example instead.

3. PROVIDERS
   Wrap the app root (find where DashboardApp.tsx or App.tsx sets up
   providers) with WagmiProvider, QueryClientProvider (from
   @tanstack/react-query), and RainbowKitProvider. Keep any existing
   providers already in place — add these, don't replace them.

4. REPLACE THE FAKE ONBOARDING WALLET STEP
   In src/features/ui-preview/dashboard/Onboarding.jsx, the current
   "wallet picker" step is a static/fake UI with no real connection
   logic. Replace it with real wagmi hooks:
   - Use wagmi's useConnect() and the available connectors (injected
     MetaMask/browser wallet, Coinbase Wallet connector, WalletConnect)
     to drive the existing wallet-picker UI — keep the current visual
     layout/markup/classnames as-is, just wire real onClick handlers
     to connector.connect().
   - After connection, use useAccount() to get the address and move
     the onboarding flow to the next step (sign-to-verify) only once
     a real connection succeeds. Remove any setTimeout/fake-delay logic
     currently simulating this.

5. SIGN-TO-VERIFY STEP
   Implement this using wagmi's useSignMessage(). Generate a simple
   SIWE-style message client-side (domain, address, nonce, issued-at)
   and request a signature. On success, proceed to the next onboarding
   step (display name). Don't build a backend verification endpoint yet
   — just get the real signature flow working client-side and log the
   result to console for now; note clearly in a code comment that
   server-side signature verification still needs to be added.

6. DISPLAY CONNECTED STATE
   Wherever the sidebar/user card currently shows a hardcoded wallet
   address (in Sidebar.jsx), replace it with the real connected address
   from useAccount() (formatted as 0x1234...abcd). Add a disconnect
   option using useDisconnect().

7. DO NOT
   - Do not implement real balance fetching, deposit/withdraw contract
     calls, swap, or bridge logic yet — those come later.
   - Do not modify dashboard.css, UiView.css, or any Tailwind conversion.
   - Do not change routing — this stays inside the existing ui-preview
     feature folder for now.
   - Do not remove the existing risk-acknowledgement onboarding step,
     just make sure it still runs after sign-to-verify.

After implementing, tell me exactly which files you changed and flag
anywhere you had to deviate from this because of how the existing
component is structured.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/63de92da-74f7-43ed-bac5-544586c6a3ca).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
