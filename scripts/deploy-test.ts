import { ethers } from "hardhat";
import { AffiliateTest } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Test = await ethers.getContractFactory("AffiliateTest");
  const Token = await ethers.getContractFactory("ReachTest");
  const token = await Token.deploy();
  await token.deployed();
  const test = (await Test.deploy(deployer.address)) as AffiliateTest;
  await test.deployed();

  console.log("Test deployed to:", test.address, token.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
