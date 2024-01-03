// deploy.ts
import { ethers } from "hardhat";
import { contracts } from "../config/contracts";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const reachToken = await ethers.getContractAt("Reach", contracts.reach);
  const reachMainDistribution = await ethers.getContractAt(
    "ReachMainDistribution",
    contracts.mainDistribution
  );
  // const ReachMainDistribution = await ethers.getContractFactory(
  //   "ReachMainDistribution"
  // );
  // const reachMainDistribution = await ReachMainDistribution.deploy(
  //   reachToken.address
  // );

  // await reachMainDistribution.deployed();
  // console.log(
  //   "ReachMainDistribution deployed to:",
  //   reachMainDistribution.address
  // );
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

  await reachDistributionFactory.deployAffiliateDistribution(
    "0x89013a8759e80f3A73E4591FbF90317bBa959b09"
  );

  const filter =
    reachDistributionFactory.filters.ReachAffiliateDistributionCreated();
  const events = await reachDistributionFactory.queryFilter(filter);
  const event = events[0];
  // const affiliateDistribution = await ethers.getContractAt(
  //   "ReachAffiliateDistribution",
  //   event.args.distribution
  // );

  console.log("ReachAffiliateDistribution deployed to:", event.args[0]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
