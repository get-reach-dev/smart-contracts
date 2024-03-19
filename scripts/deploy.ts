// deploy.ts
import { ethers } from "hardhat";

async function main() {
  const addrs = (await ethers.getSigners()) as any[];
  const TokenFactory = await ethers.getContractFactory("TAB");
  const token = await TokenFactory.deploy();
  await token.deployed();
  console.log("Token deployed to:", token.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
