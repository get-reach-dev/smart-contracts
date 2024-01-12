import { ethers } from "hardhat";
import { contracts } from "../config/contracts";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Test = await ethers.getContractFactory("AffiliateTest");

  const test = await Test.deploy(deployer.address);
  await test.deployed();

  console.log("Test deployed to:", test.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
