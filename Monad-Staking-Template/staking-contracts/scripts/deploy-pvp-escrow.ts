import "dotenv/config";
import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CONTRACT_NAME = "PvpWagerEscrow";

async function main(): Promise<void> {
  console.log(`\nDeploying ${CONTRACT_NAME}...\n`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  const Contract = await hre.ethers.getContractFactory(CONTRACT_NAME);
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const contractAddress = String(contract.target);
  console.log(`${CONTRACT_NAME} deployed:`, contractAddress);

  const data = {
    contract: CONTRACT_NAME,
    address: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const filePath = path.join(__dirname, "..", "deployed-pvp-escrow.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log("Saved:", filePath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
