// Minimal ABI for the mint page. Extend from Foundry's out/WeddingCollection.sol
// artifact if you need the full surface.
export const weddingAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mintAs", stateMutability: "nonpayable", inputs: [{ name: "pseudo", type: "string" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "setPseudo", stateMutability: "nonpayable", inputs: [{ name: "pseudo", type: "string" }], outputs: [] },
  { type: "function", name: "transferAll", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenIds", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "tokensOfOwner", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "pseudoOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "string" }] },
  { type: "function", name: "isMintOpen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "mintEnd", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "goldenFound", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "goldenInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "found", type: "bool" },
      { name: "finder", type: "address" },
      { name: "pseudo", type: "string" },
      { name: "tokenId", type: "uint256" },
      { name: "foundAt", type: "uint256" },
    ],
  },
  { type: "function", name: "isComplete", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "goldenClaimed", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "poolOwnedCount", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "copiesOf", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }, { name: "designId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "packedCopies", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mintedCounts", stateMutability: "view", inputs: [], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "goldenMintedCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextMintAvailableAt", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MINT_COOLDOWN", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "designId", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GoldenFound",
    inputs: [
      { name: "finder", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "pseudo", type: "string", indexed: false },
    ],
  },
] as const;
