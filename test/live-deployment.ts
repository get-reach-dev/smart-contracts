import { expect } from "chai";
import { parseEther } from "ethers";
import fs from "fs";
import { ethers } from "hardhat";
import { BlockchainHelper } from "../services/blockchain";
import { GasliteDrop, Reach, Reach__factory } from "../typechain-types";
import { IUniswapV2Router02 } from "../typechain-types/contracts/Uniswap.sol/IUniswapV2Router02";
let addrs: any[] = [];
let TokenFactory: Reach__factory;
let uniswap: IUniswapV2Router02;
let token: Reach;
let gasLiteDrop: GasliteDrop;
let tokenAddress: string;
let blockchainHelper: BlockchainHelper;
let cumulativeGasUsed: bigint = 0n;
const airdrops = JSON.parse(
  fs.readFileSync("./data/airdrops.json", "utf8")
).map((holder: any) => {
  return {
    address: holder.address.toLowerCase(),
    amount: BigInt(holder.amount),
  };
});

describe("$Reach live deployment", function () {
  it("Should deploy to mainnet", async function () {
    addrs = await ethers.getSigners();
    TokenFactory = await ethers.getContractFactory("Reach");
    uniswap = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    gasLiteDrop = await ethers.getContractAt(
      "GasliteDrop",
      "0x09350F89e2D7B6e96bA730783c2d76137B045FEF"
    );
    token = await TokenFactory.deploy();
    await token.waitForDeployment();
    const gasLimit = token.deploymentTransaction()?.gasLimit;
    cumulativeGasUsed += gasLimit ? BigInt(gasLimit) : 0n;
    const gasForDeployment = gasLimit ? BigInt(gasLimit) : 0n;
    console.log(`Gas cost for deployment: ${gasForDeployment}`);
    tokenAddress = await token.getAddress();
    blockchainHelper = new BlockchainHelper(
      token,
      uniswap,
      addrs,
      ethers.provider
    );

    expect(tokenAddress).to.not.be.undefined;
  });

  it("Should make sure that trading is not enabled", async function () {
    const tradingEnabled = await token.tradingEnabled();
    expect(tradingEnabled).to.equal(false);
  });

  it("Should airdrop to holders", async function () {
    let gasForAirdrop = 0n;
    const airdropAmount = airdrops.reduce((acc: any, curr: any) => {
      return acc + BigInt(curr.amount);
    }, 0n);

    let gasPrice = 1n;
    for (const holder of airdrops) {
      const tx = await token.transfer(holder.address, holder.amount);
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed;
      gasPrice = receipt?.gasPrice || 1n;
      cumulativeGasUsed += gasUsed ? BigInt(gasUsed) : 0n;
      gasForAirdrop += gasUsed ? BigInt(gasUsed) : 0n;
    }

    console.log(`Gas cost for airdrop: ${gasForAirdrop}`);

    const ownerBalance = await token.balanceOf(addrs[0].address);
    const totalSupply = await token.totalSupply();
    const remainingBalance = totalSupply - airdropAmount;
    expect(ownerBalance).to.equal(remainingBalance);
  });

  it("Should make sure that all users got airdropped", async function () {
    //aggregate balances for wallets that have multiple entries in airdrops.json
    const aggregatedAirdrops: any[] = [];
    for (const holder of airdrops) {
      const existing = aggregatedAirdrops.find(
        (item) => item.address === holder.address
      );
      if (existing) {
        existing.amount += BigInt(holder.amount);
      } else {
        aggregatedAirdrops.push(holder);
      }
    }

    const balanceChecksOut = [];
    const errors = [];
    for (const holder of aggregatedAirdrops) {
      const balance = await token.balanceOf(holder.address);
      if (balance.toString() === holder.amount.toString()) {
        balanceChecksOut.push(true);
      } else {
        errors.push({
          address: holder.address,
          expected: holder.amount,
          actual: balance.toString(),
        });
      }
    }

    expect(balanceChecksOut.length).to.equal(aggregatedAirdrops.length);
  });

  it("Should add LP to uniswap", async function () {
    // await BlockchainHelper.sendEth(addrs[0]);
    await blockchainHelper.addLiquidity(addrs[0]);
    //make sure that owner has LP tokens
    const pair = await token.pair();
    const pairERC20 = await ethers.getContractAt("IERC20", pair);
    const lpBalance = await pairERC20.balanceOf(addrs[0].address);
    expect(lpBalance).to.not.equal(0);

    const pairBalance = await token.balanceOf(pair);
    expect(pairBalance).to.equal(parseEther("4000000"));
  });

  it("Should make sure that holders cannot trade yet", async function () {
    const receipt = await blockchainHelper.trade({
      amount: parseEther("1").toString(),
      direction: "buy",
      signer: addrs[1],
    });
    expect(receipt).to.be.null;
  });

  it("Should enable trading", async function () {
    const tx = await token.activateTrading();
    const receipt = await tx.wait();
    const gasUsed = receipt?.gasUsed;
    cumulativeGasUsed += gasUsed ? BigInt(gasUsed) : 0n;
    const tradingEnabled = await token.tradingEnabled();
    expect(tradingEnabled).to.equal(true);

    console.log(
      `Cumulative gas used for airdrop and trading activation: ${cumulativeGasUsed}`
    );
  });
});
