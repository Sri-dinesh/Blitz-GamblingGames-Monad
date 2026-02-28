export const ADMIN_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_ADMIN_TREASURY_ADDRESS || "";

export const PVP_WAGER_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_PVP_WAGER_CONTRACT_ADDRESS || "";

export const PVP_WAGER_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "matchId", type: "bytes32" },
      { internalType: "address", name: "opponent", type: "address" },
    ],
    name: "createMatch",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "joinMatch",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "matchId", type: "bytes32" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    name: "voteWinner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "claimPot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "getMatch",
    outputs: [
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "address", name: "opponent", type: "address" },
      { internalType: "uint256", name: "stake", type: "uint256" },
      { internalType: "bool", name: "joined", type: "bool" },
      { internalType: "bool", name: "finished", type: "bool" },
      { internalType: "bool", name: "claimed", type: "bool" },
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "uint256", name: "createdAt", type: "uint256" },
      { internalType: "uint256", name: "joinedAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "", type: "bytes32" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "winnerVotes",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
