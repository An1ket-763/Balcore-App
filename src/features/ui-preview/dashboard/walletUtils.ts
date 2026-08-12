export function shortenAddress(address?: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Build a simple SIWE-style message client-side.
 * NOTE: the signature produced from this message is currently only verified in
 * the browser. Server-side signature verification (recover address + nonce
 * replay protection) still needs to be added before this can gate anything.
 */
export function buildSiweMessage(address: string, chainId: number) {
  const domain = typeof window !== "undefined" ? window.location.host : "balcore.app";
  const uri = typeof window !== "undefined" ? window.location.origin : "https://balcore.app";
  const nonce = Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
  const issuedAt = new Date().toISOString();
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to Balcore. This is free — no transaction, no gas.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
  return { message, nonce, issuedAt };
}
