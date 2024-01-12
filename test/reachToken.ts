import { expect } from "chai";
import { formatEther, parseEther } from "ethers";
import { ethers, network } from "hardhat";
import { BlockchainHelper } from "../services/blockchain";
import { IERC20, Reach, Reach__factory } from "../typechain-types";
import { IUniswapV2Router02 } from "../typechain-types/contracts/Uniswap.sol/IUniswapV2Router02";

let addrs: any[] = [];
let TokenFactory: Reach__factory;
let uniswap: IUniswapV2Router02;
let token: Reach;
let owner: any;
let addr1: any;
let addr2: any;
let blockchainHelper: BlockchainHelper;
let weth: IERC20;

describe.skip("$Reach tests", function () {
  console.log("Starting tests");
  beforeEach(async function () {
    addrs = await ethers.getSigners();
    TokenFactory = await ethers.getContractFactory("Reach");
    uniswap = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    token = await TokenFactory.deploy();
    await token.waitForDeployment();
    await token.activateTrading();

    blockchainHelper = new BlockchainHelper(
      token,
      uniswap,
      addrs,
      network.provider
    );

    await BlockchainHelper.sendEth(owner);
    await BlockchainHelper.sendEth(addr1);
    await BlockchainHelper.sendEth(addr2);
    await blockchainHelper.airdrop();

    await blockchainHelper.addLiquidity(owner);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });
  });

  describe("Should allow trading if active", function () {
    it("Should check that trading is active", async function () {
      const tradingActive = await token.tradingEnabled();
      expect(tradingActive).to.equal(true);
    });

    it("Should able to swap ETH for tokens", async function () {
      const receipt = await blockchainHelper.trade({
        amount: "1",
        direction: "buy",
        signer: addrs[0],
      });
      expect(receipt).to.not.be.null;
    });
  });

  describe("Should apply antisnipe measures", function () {
    describe("Antisnipe active", function () {
      it("Should not be able to buy more than 0.5% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "10",
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.be.null;
      });

      it("Should not be able to own more than 1% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "10",
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.be.null;
      });

      it("Should still be able to sell more than 2% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "10",
          direction: "sell",
          signer: addrs[0],
        });
        expect(receipt).to.not.be.null;
      });
    });

    describe("Anti-snipe disabled", async function () {
      it("Should be able to buy more than 0.5% of total supply if antisnipe is disabled", async function () {
        await network.provider.send("evm_increaseTime", [1801]);
        await network.provider.send("evm_mine");
        await BlockchainHelper.sendEth(addrs[0]);

        const amount = "40";
        const amountString = amount.toString();
        const receipt = await blockchainHelper.trade({
          amount: amountString,
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.not.be.null;
      });

      it("Should be able to own more than 1% of total supply if antisnipe is disabled", async function () {
        await network.provider.send("evm_increaseTime", [3601]);
        await network.provider.send("evm_mine");
        await BlockchainHelper.sendEth(addrs[0]);

        const amount = "40";
        const amountString = amount.toString();
        const receipt = await blockchainHelper.trade({
          amount: amountString,
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.not.be.null;
      });
    });
  });

  describe("Should take fees from trades", function () {
    it("Should take 4% fee from buy", async function () {
      const percentage = await blockchainHelper.tradeAndReturnTax(
        "1",
        "buy",
        addrs[0]
      );
      expect(percentage).to.be.closeTo(0.04, 0.001);
    });

    it("Should take 4% fee from sell", async function () {
      const percentage = await blockchainHelper.tradeAndReturnTax(
        "100000",
        "sell",
        addrs[0]
      );
      expect(percentage).to.be.closeTo(0.04, 0.001);
    });
  });

  describe("Should generate eth volume", function () {
    it("Should generate eth volume", async function () {
      const { ethTradeVolume, tokenTradeVolume } =
        await blockchainHelper.runBatchTrades(10);
      const totalVolume = ethTradeVolume + tokenTradeVolume;
      expect(totalVolume).to.be.greaterThan(0);
    });
  });

  describe("Should swap taxes", function () {
    it("Should swap taxes for eth", async function () {
      const treasury = await token.treasuryWallet();
      const ethBalanceBefore = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      weth = await ethers.getContractAt(
        "IERC20",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
      );
      const {
        totalFeesCollected,
        ethTradeVolume,
        tokenTradeVolume,
        accumulatedTokens,
      } = await blockchainHelper.runBatchTrades(50);
      const ethBalanceAfter = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      const contractBalance = await token.balanceOf(await token.getAddress());

      //pair eth balance
      const pair = await token.pair();
      const pairBalance = await weth.balanceOf(pair);
      console.log(`
      totalFeesCollected: ${totalFeesCollected} \n
      ethTradeVolume: ${ethTradeVolume} \n
      tokenTradeVolume: ${tokenTradeVolume} \n
      pairBalance: ${formatEther(pairBalance)} \n
      accumulatedTokens: ${accumulatedTokens} \n
      contractBalance: ${formatEther(contractBalance)} \n
      `);

      expect(totalFeesCollected).to.be.greaterThan(0);
      const diff = formatEther((ethBalanceAfter - ethBalanceBefore).toString());

      const diffFirstDigits = diff.slice(0, 2);
      const feesFirstDigits = totalFeesCollected.toString().slice(0, 2);
      // const feesInEth = parseEther(totalFeesCollected.toString());
      expect(diffFirstDigits).to.equal(feesFirstDigits.toString());
    });
  });

  describe("Annex functions", function () {
    it("Should be able to withdraw tokens", async function () {
      await token.transfer(await token.getAddress(), "100");
      const intialBalance = await token.balanceOf(await owner.getAddress());
      const tx = await token.rescueERC20Tokens(await token.getAddress());
      await tx.wait();
      const balance = await token.balanceOf(await owner.getAddress());
      const diff = balance - intialBalance;
      expect(diff).to.be.equal(100);
    });

    it("Should be able to withdraw eth", async function () {
      //send eth to contract
      await network.provider.send("hardhat_setBalance", [
        await token.getAddress(),
        "0x56BC75E2D63100000",
      ]);

      const tx = await token.forceSend();
      await tx.wait();
      const contractEthBalanceAfter = await network.provider.send(
        "eth_getBalance",
        [await token.getAddress()]
      );
      expect(contractEthBalanceAfter).to.equal("0x0");

      const treasuryWallet = await token.treasuryWallet();
      const balance = await network.provider.send("eth_getBalance", [
        treasuryWallet,
      ]);
      //close to 10%
      expect(balance).to.be.closeTo(parseEther("100"), parseEther("10"));
    });
  });
});
