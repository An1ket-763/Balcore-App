/**
 * Circle CCTP V2 — constants, ABIs and pure helpers for the USDC bridge.
 *
 * CCTP moves native USDC by BURNING it on the source chain and MINTING it on
 * the destination. There is no liquidity pool and no wrapped token: what lands
 * on Avalanche is the same Circle USDC the deposit flow already reads.
 *
 * Every address, domain id and signature below was taken from Circle's own
 * documentation and contract source, NOT from memory. A wrong address here
 * does not throw — it burns real USDC into a contract that will never mint it
 * back. Treat this file as append-only unless you have re-verified against
 * https://developers.circle.com/cctp/evm-smart-contracts.
 *
 * This module is deliberately pure: constants, types and functions with no
 * viem/wagmi/React imports, so the encoding can be tested in isolation.
 */

import type { Address, Hex } from "viem";
import { isMainnet } from "./wagmi";

/* ------------------------------------------------------------------ */
/* Domains                                                             */
/* ------------------------------------------------------------------ */

/**
 * CCTP domain ids. These are Circle's OWN numbering and have nothing to do
 * with EVM chain ids — Ethereum is chain 1 but domain 0. Mixing the two sends
 * funds to the wrong chain, so the two are never interchangeable here.
 *
 * Testnet domains are identical to mainnet; only the contracts differ.
 */
export const CCTP_DOMAIN = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  solana: 5,
  base: 6,
  polygon: 7,
} as const;

export type CctpDomain = (typeof CCTP_DOMAIN)[keyof typeof CCTP_DOMAIN];

/**
 * USDC is 6 decimals on every chain Circle issues it natively, so the bridge
 * does not spend a round-trip reading `decimals()` per chain. If a future
 * route ever breaks that assumption, read it rather than widening this.
 */
export const USDC_DECIMALS = 6;

/**
 * Arms the REAL burn/mint path. Off unless VITE_BRIDGE_LIVE=true.
 *
 * The bridge is being built in stages and the burn destroys USDC before the
 * mint exists to recreate it. Until the whole path is finished, shipping the
 * real burn would let a user strand their own funds mid-flight, so the panel
 * keeps running its simulation and this flag is what switches it over.
 */
export const BRIDGE_LIVE = import.meta.env["VITE_BRIDGE_LIVE"] === "true";

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

/**
 * CCTP V2 deploys at the SAME address on every EVM chain, which is why these
 * are single values rather than per-chain maps. V1 is deprecated; V2 is the
 * canonical protocol and its contracts are not interchangeable with V1's.
 */
const TOKEN_MESSENGER_MAINNET = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const;
const TOKEN_MESSENGER_TESTNET = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;

const MESSAGE_TRANSMITTER_MAINNET = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;
const MESSAGE_TRANSMITTER_TESTNET = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

/** Burns USDC on the source chain. Needs the ERC-20 allowance. */
export const TOKEN_MESSENGER_V2: Address = isMainnet
  ? TOKEN_MESSENGER_MAINNET
  : TOKEN_MESSENGER_TESTNET;

/** Mints USDC on the destination chain once Circle has attested the burn. */
export const MESSAGE_TRANSMITTER_V2: Address = isMainnet
  ? MESSAGE_TRANSMITTER_MAINNET
  : MESSAGE_TRANSMITTER_TESTNET;

/* ------------------------------------------------------------------ */
/* Supported routes                                                    */
/* ------------------------------------------------------------------ */

/**
 * One bridgeable chain: how wagmi knows it, how CCTP knows it, and where its
 * native USDC lives.
 *
 * `usdc` is the NATIVE Circle USDC on that chain — never a bridged variant
 * such as Avalanche's older USDC.e. CCTP will not burn a bridged token.
 */
export interface BridgeChain {
  /** Key used in the UI and in persisted transfer records. */
  key: string;
  /** Label shown in the chips. Must match the existing markup's data-chain. */
  label: string;
  /** wagmi/viem chain id. */
  chainId: number;
  /** Circle's domain id — NOT the chain id. */
  domain: CctpDomain;
  /** Native Circle USDC on this chain. */
  usdc: Address;
}

const MAINNET_CHAINS: readonly BridgeChain[] = [
  {
    key: "avalanche",
    label: "Avalanche C-Chain",
    chainId: 43114,
    domain: CCTP_DOMAIN.avalanche,
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
  {
    key: "ethereum",
    label: "Ethereum",
    chainId: 1,
    domain: CCTP_DOMAIN.ethereum,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    key: "base",
    label: "Base",
    chainId: 8453,
    domain: CCTP_DOMAIN.base,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    key: "arbitrum",
    label: "Arbitrum",
    chainId: 42161,
    domain: CCTP_DOMAIN.arbitrum,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    key: "polygon",
    label: "Polygon",
    chainId: 137,
    domain: CCTP_DOMAIN.polygon,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
] as const;

const TESTNET_CHAINS: readonly BridgeChain[] = [
  {
    key: "avalanche",
    label: "Avalanche C-Chain",
    chainId: 43113,
    domain: CCTP_DOMAIN.avalanche,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  {
    key: "ethereum",
    label: "Ethereum",
    chainId: 11155111,
    domain: CCTP_DOMAIN.ethereum,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  {
    key: "base",
    label: "Base",
    chainId: 84532,
    domain: CCTP_DOMAIN.base,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    key: "arbitrum",
    label: "Arbitrum",
    chainId: 421614,
    domain: CCTP_DOMAIN.arbitrum,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  {
    key: "polygon",
    label: "Polygon",
    chainId: 80002,
    domain: CCTP_DOMAIN.polygon,
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  },
] as const;

/** Bridgeable chains for the selected environment. Avalanche is always first. */
export const BRIDGE_CHAINS: readonly BridgeChain[] = isMainnet ? MAINNET_CHAINS : TESTNET_CHAINS;

/** The hub every bridge starts from or ends at. */
export const AVALANCHE_CHAIN: BridgeChain = BRIDGE_CHAINS[0] as BridgeChain;

/** Everything except Avalanche — what the chain chips offer. */
export const COUNTERPART_CHAINS: readonly BridgeChain[] = BRIDGE_CHAINS.slice(1);

export function chainByKey(key: string): BridgeChain | null {
  return BRIDGE_CHAINS.find((c) => c.key === key) ?? null;
}

/** Match the existing markup's `data-chain` labels to a supported chain. */
export function chainByLabel(label: string): BridgeChain | null {
  return BRIDGE_CHAINS.find((c) => c.label === label) ?? null;
}

export function chainByDomain(domain: number): BridgeChain | null {
  return BRIDGE_CHAINS.find((c) => c.domain === domain) ?? null;
}

/* ------------------------------------------------------------------ */
/* Transfer speed                                                      */
/* ------------------------------------------------------------------ */

/**
 * `minFinalityThreshold` is a NUMBER, not a flag: 1000 or below asks Iris to
 * attest at the confirmed level (Fast), 2000 waits for hard finality
 * (Standard). Anything else is not a third mode — it just changes how long
 * Circle waits before signing.
 */
export const FINALITY = {
  fast: 1000,
  standard: 2000,
} as const;

export type TransferSpeed = keyof typeof FINALITY;

/**
 * Standard transfers are free, so the most the user may be charged is zero and
 * `maxFee` must be 0. Fast transfers pay a per-route fee that Circle quotes
 * live; `maxFee` is the ceiling the user accepts, and the burn REVERTS if
 * Circle's fee exceeds it.
 */
export function maxFeeFor(speed: TransferSpeed, amount: bigint, quotedBps: number | null): bigint {
  if (speed === "standard") return 0n;
  // No quote yet means no informed ceiling — the caller must wait for the fee
  // API rather than guess, so refuse instead of inventing a number.
  if (quotedBps === null || !Number.isFinite(quotedBps) || quotedBps < 0) return 0n;
  // A little headroom, because the quote can move between fetch and signing.
  const bpsWithBuffer = BigInt(Math.ceil(quotedBps) + 1);
  return (amount * bpsWithBuffer) / 10_000n;
}

/** Fee in the burn token's units for a quoted basis-point rate. */
export function feeFromBps(amount: bigint, bps: number | null): bigint | null {
  if (bps === null || !Number.isFinite(bps) || bps < 0) return null;
  // Circle quotes fractional bps on some routes; scale up to keep the fraction.
  const scaled = BigInt(Math.round(bps * 1000));
  return (amount * scaled) / 10_000_000n;
}

/* ------------------------------------------------------------------ */
/* Circle's Iris API                                                   */
/* ------------------------------------------------------------------ */

/** Public REST, no auth — same shape as the existing aggregator clients. */
export const IRIS_BASE = isMainnet
  ? "https://iris-api.circle.com"
  : "https://iris-api-sandbox.circle.com";

/** Where to poll for the signed attestation covering a burn transaction. */
export function attestationUrl(sourceDomain: number, burnTxHash: Hex): string {
  return `${IRIS_BASE}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
}

/** Where to ask what a Fast Transfer currently costs on this route. */
export function feeUrl(sourceDomain: number, destinationDomain: number): string {
  return `${IRIS_BASE}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`;
}

/** Attestation states Iris reports. `complete` is the only one we can mint on. */
export type AttestationStatus = "complete" | "pending_confirmations";

/* ------------------------------------------------------------------ */
/* ABIs                                                                */
/* ------------------------------------------------------------------ */

/**
 * TokenMessengerV2.depositForBurn — SEVEN parameters.
 *
 * V1's four-parameter version is still all over the internet and is NOT
 * call-compatible: the selector differs, so a V1-shaped call against a V2
 * contract simply reverts. Verified against circlefin/evm-cctp-contracts
 * src/v2/TokenMessengerV2.sol.
 */
export const tokenMessengerV2Abi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

/** MessageTransmitterV2.receiveMessage — the mint side. */
export const messageTransmitterV2Abi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

/* ------------------------------------------------------------------ */
/* Encoding helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * CCTP takes recipients as bytes32, not address, so Solana and other 32-byte
 * address spaces fit the same message format. An EVM address is left-padded
 * with twelve zero bytes.
 *
 * Getting this wrong is silent and unrecoverable: a right-padded address is a
 * perfectly valid bytes32 that nobody controls, and the minted USDC lands
 * there permanently.
 */
export function addressToBytes32(address: Address): Hex {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 40 || !/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error(`Not a 20-byte address: ${address}`);
  }
  return `0x${"0".repeat(24)}${clean}` as Hex;
}

/** Inverse of addressToBytes32, for reading a message back. */
export function bytes32ToAddress(value: Hex): Address {
  const clean = value.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 64) throw new Error(`Not a bytes32 value: ${value}`);
  if (clean.slice(0, 24) !== "0".repeat(24)) {
    throw new Error(`bytes32 is not a padded EVM address: ${value}`);
  }
  return `0x${clean.slice(24)}` as Address;
}

/**
 * Leaving `destinationCaller` empty means ANY address may call
 * receiveMessage — the recipient, or a relayer paying gas on their behalf.
 *
 * Keep it zero. Restricting it to the user's own address would permanently
 * close the door on the gasless relayer, because the restriction is baked
 * into the burn message and cannot be changed afterwards.
 */
export const ANY_CALLER: Hex = `0x${"0".repeat(64)}` as Hex;

/* ------------------------------------------------------------------ */
/* Timing, for honest UI copy                                          */
/* ------------------------------------------------------------------ */

/**
 * Rough wall-clock expectations. Fast is Circle's confirmed-level attestation;
 * Standard waits for the source chain's hard finality, which is why Ethereum
 * is so much slower than the L2s.
 */
export function etaLabel(speed: TransferSpeed, source: BridgeChain): string {
  if (speed === "fast") return "~8-20 seconds";
  return source.domain === CCTP_DOMAIN.ethereum
    ? "~13-19 minutes (finality)"
    : "~1-5 minutes (finality)";
}
