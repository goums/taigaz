import { baseSepolia, base } from "viem/chains";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 84532);
export const CHAIN = CHAIN_ID === 8453 ? base : baseSepolia;

export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string;

// Optional Alchemy RPC for reads (more reliable than the public endpoint).
const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined;
const ALCHEMY_HOST = CHAIN_ID === 8453 ? "base-mainnet" : "base-sepolia";
export const RPC_URL = ALCHEMY_KEY
  ? `https://${ALCHEMY_HOST}.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : undefined; // undefined -> viem uses the chain's default public RPC

// Startup diagnostics (helps confirm which RPC/contract the app is using).
console.info(
  "[taigaz] chain=%s contract=%s rpc=%s alchemyKey=%s",
  CHAIN_ID,
  CONTRACT_ADDRESS,
  RPC_URL ?? "(public default sepolia.base.org)",
  ALCHEMY_KEY ? "set" : "MISSING"
);

export const POOL_SIZE = 16;

// Block just before the contract was deployed — bounds getLogs queries.
export const DEPLOY_BLOCK = 44779000n;

// Block explorer + marketplace bases (testnet).
export const EXPLORER =
  CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
export const OPENSEA =
  CHAIN_ID === 8453
    ? `https://opensea.io/assets/base/${CONTRACT_ADDRESS}`
    : `https://testnets.opensea.io/assets/base_sepolia/${CONTRACT_ADDRESS}`;
export const RARIBLE =
  CHAIN_ID === 8453
    ? `https://rarible.com/collection/base/${CONTRACT_ADDRESS}/items`
    : `https://testnet.rarible.com/collection/${CONTRACT_ADDRESS}/items`;
