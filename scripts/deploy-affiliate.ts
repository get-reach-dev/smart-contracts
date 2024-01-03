import { ethers } from "hardhat";
import { contracts } from "../config/contracts";

async function main() {
  const owner = process.argv[2];
  if (!owner) {
    throw new Error("Please provide an owner address");
  }

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractAt(
    "ReachDistributionFactory",
    contracts.factory
  );

  console.log("Deploying affiliate with the account:", deployer.address);

  await factory.deployAffiliateDistribution(owner);
  const filter = factory.filters.ReachAffiliateDistributionCreated();
  const events = await factory.queryFilter(filter);
  const event = events[events.length - 1];

  const affiliateDistribution = await ethers.getContractAt(
    "ReachAffiliateDistribution",
    event.args.distribution
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
