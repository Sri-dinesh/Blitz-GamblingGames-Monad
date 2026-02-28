# Monad Staking Template (Hardhat + Frontend)

This project is a ready-to-use staking template on **Monad Testnet**.

It includes:
- `contracts/RewardToken.sol`: sample ERC20 reward token
- `contracts/StakingContract.sol`: `StakingRewards` staking contract
- `contracts/PvpWagerEscrow.sol`: multiplayer stake escrow (`create/join/vote winner/claim`)
- `scripts/step-1-deploy-reward-token.ts`: deploy reward token
- `scripts/deploy.ts`: deploy staking contract with staking/reward token addresses
- `scripts/deploy-pvp-escrow.ts`: deploy PVP escrow contract

## Network
- Network name: `monadTestnet`
- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Explorer: `https://testnet.monadvision.com`

## Prerequisites
- Node.js `20+` recommended
- npm (or pnpm)
- Funded Monad Testnet wallet

## 1) Install dependencies

```bash
npm install
```

## 2) Configure wallet

Create `.env` in this folder:

```env
PRIVATE_KEY=0xyour_private_key
```

## 3) Compile contracts

```bash
npx hardhat compile
```

## 4) Deploy reward token

```bash
 hardhat run scripts/step-1-deploy-reward-token.ts --network monadTestnet
```

Output is saved to:
- `reward-token-address.json`

Copy the deployed reward token address.

## 5) Configure staking deploy script

Open `scripts/deploy.ts` and set:
- `STAKING_TOKEN_ADDRESS` to your staking token (example: testnet USDC)
- `REWARD_TOKEN_ADDRESS` to the address from step 4

## 6) Deploy staking contract

```bash
npx hardhat run scripts/deploy.ts --network monadTestnet
```

Output is saved to:
- `deployed-addresses.json`

## 7) Initialize rewards (owner flow)

After deployment, owner should:
1. Fund staking contract with reward token
2. Call `setRewardsDuration(_duration)`
3. Call `notifyRewardAmount(_amount)`

Without these, users can stake but rewards will not emit correctly.

## 8) Connect frontend

Open frontend config:
- `../frontend /app/config/staking_config.ts`

Set these values:
- `STAKING_CONTRACT_ADDRESS`
- `STAKING_TOKEN_ADDRESS`
- `REWARD_TOKEN_ADDRESS`

Then run frontend:

```bash
cd "../frontend "
npm install
npm run dev
```

## 9) Deploy PVP wager escrow (for NFT multiplayer game)

```bash
npx hardhat run scripts/deploy-pvp-escrow.ts --network monadTestnet
```

Output is saved to:
- `deployed-pvp-escrow.json`

Set frontend env values in `../frontend_/.env.local`:

```env
NEXT_PUBLIC_PVP_WAGER_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_ADMIN_TREASURY_ADDRESS=0x...   # your admin wallet for single-player loss transfers
```

## Main contract functions

User:
- `stake(uint256 _amount)`
- `withdraw(uint256 _amount)`
- `getReward()`
- `earned(address _account)`

Owner:
- `setRewardsDuration(uint256 _duration)`
- `notifyRewardAmount(uint256 _amount)`

## Troubleshooting

- `HH411 openzeppelin-solidity not installed`:
  - Use `@openzeppelin/contracts` imports only.
- Wrong network in wallet:
  - Switch to chain `10143` (`Monad Testnet`).
- Frontend compile/lint errors due to Node:
  - Use Node `20+`.
