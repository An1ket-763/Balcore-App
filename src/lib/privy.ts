import type { PrivyClientConfig, User } from "@privy-io/react-auth";
import type { SetActiveWalletForWagmiType } from "@privy-io/wagmi";
import { chains, defaultChain } from "@/lib/wagmi";
import { LOGO } from "@/features/ui-preview/dashboard/logo";

/**
 * Privy app ID from the Privy dashboard (dashboard.privy.io → your app →
 * Settings). It is a public identifier, safe to ship to the browser.
 */
export const privyAppId = (import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined) ?? "";

const walletConnectProjectId =
  (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) ?? "";

// Same viem chain objects wagmi uses; the cast only bridges a strict-mode
// optional-property mismatch between viem's and Privy's Chain typings.
type PrivyChain = NonNullable<PrivyClientConfig["defaultChain"]>;

/**
 * Sign-in options:
 * - email / Google: for people new to crypto. Privy creates a self-custodial
 *   embedded wallet for them on first sign-in (no seed phrase, no extension).
 * - wallet: for people who already use Core, MetaMask, Rabby, Coinbase Wallet
 *   or a WalletConnect mobile wallet. Privy asks them to sign a message to
 *   prove ownership, so the old hand-rolled SIWE step is no longer needed.
 *
 * Every method listed here must ALSO be enabled in the Privy dashboard
 * (User management → Authentication), or that option fails at sign-in.
 */
export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google", "wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#8b7bf5",
    logo: LOGO,
    landingHeader: "Sign in to Balcore",
    showWalletLoginFirst: false,
    walletChainType: "ethereum-only",
    walletList: ["detected_ethereum_wallets", "metamask", "coinbase_wallet", "wallet_connect"],
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "users-without-wallets" },
  },
  defaultChain: defaultChain as unknown as PrivyChain,
  supportedChains: [...chains] as unknown as PrivyChain[],
  // Only override Privy's default WalletConnect project when we have our own.
  ...(walletConnectProjectId ? { walletConnectCloudProjectId: walletConnectProjectId } : {}),
};

/** Addresses of the wallets that belong to this Privy user (lower-cased). */
function linkedWalletAddresses(user: User): Set<string> {
  const out = new Set<string>();
  for (const account of user.linkedAccounts) {
    if (account.type === "wallet") out.add(account.address.toLowerCase());
  }
  return out;
}

/**
 * Decides which wallet wagmi treats as "the connected account".
 *
 * - Signed out → no wallet, so wagmi reports disconnected and the onboarding
 *   gate shows. A browser extension that happens to be unlocked never leaks
 *   into the app without a Privy sign-in.
 * - Signed in → the user's primary wallet (the embedded wallet for email and
 *   Google users, the external wallet for wallet users), falling back to any
 *   other wallet linked to the same account.
 *
 * Must stay a module-level function: Privy re-runs its sync whenever this
 * reference changes.
 */
export const pickActiveWallet: SetActiveWalletForWagmiType = ({ wallets, user }) => {
  if (!user) return undefined;
  const linked = linkedWalletAddresses(user);
  const mine = wallets.filter((w) => linked.has(w.address.toLowerCase()));
  const primary = user.wallet?.address?.toLowerCase();
  return (
    mine.find((w) => w.address.toLowerCase() === primary) ??
    mine.find((w) => w.walletClientType === "privy") ??
    mine[0]
  );
};

/** True when the user's primary wallet is the Privy embedded wallet (email/Google sign-in). */
export function isEmbeddedWalletUser(user: User | null): boolean {
  return user?.wallet?.walletClientType === "privy";
}

/** The email the user signed in with, if any (email or Google). */
export function signInEmail(user: User | null): string | undefined {
  return user?.email?.address ?? user?.google?.email ?? undefined;
}
