// deploy.ts
import { ethers } from "hardhat";
import { contracts } from "../config/contracts";
import fs from "fs";

async function main() {
  const Airdrop = await ethers.getContractFactory("ReachAirdrop");
  const merkleTree = JSON.parse(
    fs.readFileSync("./data/merkleTree.json", "utf-8")
  );
  if (!merkleTree || merkleTree.length === 0) {
    throw new Error("No merkle tree found");
  }

  const airdrop = await Airdrop.deploy(merkleTree.root, contracts.reach);
  await airdrop.deployed();

  console.log("Airdrop deployed to:", airdrop.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
