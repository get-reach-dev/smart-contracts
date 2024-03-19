// deploy.ts
import { configDotenv } from "dotenv";
import { ethers, network } from "hardhat";

configDotenv();
async function main() {
  const addrs = (await ethers.getSigners()) as any[];
  const token = await ethers.getContractAt(
    "TokenDrop",
    "0x5DCA55378cc30536bdacdDb6FAe1559890f6BE82"
  );
  const balance = await token.balanceOf(token.address);
  //   const owner = new ethers.Wallet(process.env.PRIVATE_KEY as string);
  //   const signer = await ethers.getImpersonatedSigner(
  //     "0x80d49eb06Ab785E963B0D4f062cc7DBf7F944aad"
  //   );
  //impersonate the owner

//   await token.activateTrading.estimateGas({
//     gasLimit: 1000000,
//   });

//   await token.updateTaxes.estimateGas(10, 10);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
