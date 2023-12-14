// deploy.ts
import { ethers } from "hardhat";
import { ReachDistributionFactory } from "../typechain-types";

async function main() {
  console.log("Deploying contract...");
  // Compiling the contract
  const Token = await ethers.getContractFactory("Reach");
  const ReachFactory = await ethers.getContractFactory(
    "ReachDistributionFactory"
  );

  // Deploying the contract
  const token = await Token.deploy();
  await token.waitForDeployment();
  const address = await token.getAddress();
  console.log(`Token deployed to: ${address}`);

  const factory = (await ReachFactory.deploy(
    address
  )) as ReachDistributionFactory;
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`Factory deployed to: ${factoryAddress}`);
  const tx = await factory.deployAffiliateDistribution();
  const data = await tx.wait();
  // look for event ReachAffiliateDistributionCreated
  const filter = factory.filters.ReachAffiliateDistributionCreated();
  const events = await factory.queryFilter(filter, -1);
  const event = events[0];
  const affiliateDistributionAddress = event.args[0];
  console.log(
    `Affiliate distribution deployed to: ${affiliateDistributionAddress}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
