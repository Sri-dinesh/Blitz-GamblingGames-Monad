# Monad Games

Monad Games is a multi-game Web3 platform built on Monad Testnet with wallet-based gameplay, real-time multiplayer, and on-chain wager settlement.

## Links
- Demo: [https://monad-games.vercel.app/](https://monad-games.vercel.app/)
- GitHub: [https://github.com/Sri-dinesh/Monad-Games](https://github.com/Sri-dinesh/Monad-Games)

## What It Includes
- Single-player games:
  - Mines
  - Apex (High/Low/Equal)
- Multiplayer game:
  - NFT Card Duel (WebSocket real-time battle)
- Sports:
  - Cricket betting section (live/current match feed)
- Staking dashboard:
  - Stake, withdraw, claim rewards on Monad

## On-Chain Transaction Flows
- Single-player (Mines/Apex):
  - On loss, stake transfers to admin treasury wallet.
- Multiplayer NFT Duel:
  - Player 1 creates on-chain stake.
  - Player 2 joins with equal stake.
  - After match, both vote winner.
  - Winner claims pot from escrow contract.

## Tech Stack
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- Wallet/Chain: ethers.js, Monad Testnet (chainId `10143`)
- Smart contracts: Solidity + Hardhat + OpenZeppelin
- Realtime: WebSocket server using `ws`
- Sports data: CricAPI (server-side proxy route)
- Hosting: Vercel (frontend), Render or similar (WebSocket server)

## Project Structure
- `Monad-Staking-Template/frontend_` -> Next.js app
- `Monad-Staking-Template/staking-contracts` -> Solidity contracts and deploy scripts

## Prerequisites
- Node.js `20+`
- npm
- Monad testnet funded wallet

## Environment Variables
Create `Monad-Staking-Template/frontend_/.env.local`:

```env
CRICAPI_KEY=your_cricapi_key
NEXT_PUBLIC_ADMIN_TREASURY_ADDRESS=0xyour_admin_wallet
NEXT_PUBLIC_PVP_WAGER_CONTRACT_ADDRESS=0xyour_pvp_escrow_contract

# Optional (staking page overrides)
NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_STAKING_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=0x...
```

Create `Monad-Staking-Template/staking-contracts/.env`:

```env
PRIVATE_KEY=0xyour_private_key
```

## Run Locally

### 1) Contracts
```bash
cd Monad-Staking-Template/staking-contracts
npm install
npx hardhat compile
```

Deploy PvP escrow:
```bash
npx hardhat run scripts/deploy-pvp-escrow.ts --network monadTestnet
```

### 2) Frontend
```bash
cd ../frontend_
npm install
npm run dev
```

### 3) WebSocket Server (NFT Multiplayer)
```bash
npm run ws:nft:public
```

Open:
- Frontend: `http://localhost:3000`
- Games: `http://localhost:3000/games`
- NFT Duel: `http://localhost:3000/games/nft-card`

## Production Notes
- If frontend is HTTPS (Vercel), WebSocket must use `wss://` (not `ws://`).
- Host WebSocket server separately (Render/Railway/Fly/VM) and use its public `wss://` URL.

## Key Pages
- `/` -> Staking dashboard
- `/games` -> Games lobby
- `/games/mines` -> Mines
- `/games/apex` -> Apex
- `/games/nft-card` -> NFT multiplayer duel
- `/sports` -> Sports hub
- `/sports/cricket` -> Cricket betting
