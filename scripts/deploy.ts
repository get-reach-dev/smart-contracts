// deploy.ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  const ReachMainDistribution = await ethers.getContractFactory(
    "ReachMainDistribution"
  );
  const reachMainDistribution = await ReachMainDistribution.deploy();
  await reachMainDistribution.deployed();

  console.log(
    "ReachMainDistribution deployed to:",
    reachMainDistribution.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
