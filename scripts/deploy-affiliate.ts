import { ethers } from "hardhat";
import { contracts } from "../config/contracts";

async function main() {
  const owner = "0x89013a8759e80f3A73E4591FbF90317bBa959b09";
  if (!owner) {
    throw new Error("Please provide an owner address");
  }

  const [deployer] = await ethers.getSigners();
  const reach = await ethers.getContractAt("Reach", contracts.reach);
  
  const factory = await ethers.getContractAt(
    "ReachDistributionFactory",
    contracts.factory
  );

  console.log("Deploying affiliate with the account:", deployer.address);
  console.log("Owner address:", owner);

  await factory.deployAffiliateDistribution(owner);
  const filter = factory.filters.ReachAffiliateDistributionCreated();
  const events = await factory.queryFilter(filter);
  const event = events[0];

  const affiliateDistribution = await ethers.getContractAt(
    "ReachAffiliateDistribution",
    event.args[0]
  );

  console.log(
    "ReachAffiliateDistribution deployed to:",
    affiliateDistribution.address
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
