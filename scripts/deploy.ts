// deploy.ts
import { ethers } from "hardhat";
import { contracts } from "../config/contracts";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  const reachToken = await ethers.getContractAt("Reach", contracts.reach);

  const ReachMainDistribution = await ethers.getContractFactory(
    "ReachMainDistribution"
  );
  const reachMainDistribution = await ReachMainDistribution.deploy(
    reachToken.address
  );

  const ReachDistributionFactory = await ethers.getContractFactory(
    "ReachDistributionFactory"
  );
  const reachDistributionFactory = await ReachDistributionFactory.deploy(
    reachToken.address,
    reachMainDistribution.address
  );

  await reachDistributionFactory.deployed();
  console.log(
    "ReachDistributionFactory deployed to:",
    reachDistributionFactory.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
