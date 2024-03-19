import { configDotenv } from "dotenv";
import { ethers } from "ethers";
import { token } from "../typechain-types/@openzeppelin/contracts";
import { TokenDrop__factory } from "../typechain-types";

configDotenv();

const provider = new ethers.providers.JsonRpcProvider(
  "https://mainnet.infura.io/v3/1b30c10bf7a646ef9fcc49f304d36ce0"
);

const main = async () => {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);
  const contract = new ethers.Contract(
    "0xce30de4e46c130403af6c6a23fd3868d16ecff71",
    TokenDrop__factory.abi,
    wallet
  );

  const uniswap = new ethers.Contract(
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    [
      "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
      "function removeLiquidityETHSupportingFeeOnTransferTokens(address token, uint amountLiquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external",
      "function removeLiquidityETH(uint amountLiquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external",
    ],
    wallet
  );

  const tx = await uniswap.removeLiquidityETHSupportingFeeOnTransferTokens(
    contract.address,
    "28284271247461900975033",
    "0",
    "0",
    wallet.address,
    Math.floor(Date.now() / 1000) + 60 * 20
  );

  console.log(tx);
};

main();
