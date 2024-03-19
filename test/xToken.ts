import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BlockchainHelper } from "../services/blockchain";
import { IERC20, IUniswapV2Router02 } from "../typechain-types";
import { TAB } from "../typechain-types/contracts/X.sol";
import { TAB__factory } from "../typechain-types/factories/contracts/X.sol";

let addrs: any[] = [];
let TokenFactory: TAB__factory;
let uniswap: IUniswapV2Router02;
let token: TAB;
let owner: any;
let addr1: any;
let addr2: any;
let weth: IERC20;
let blockchainHelper: BlockchainHelper;

describe.only("$Token tests", function () {
  console.log("Starting tests");
  beforeEach(async function () {
    TokenFactory = await ethers.getContractFactory("TAB");
    uniswap = await ethers.getContractAt(
      "IUniswapV2Router02",
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    );
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    token = await TokenFactory.deploy();
    await token.deployed();
    await token.enableTrading();

    // token = await ethers.getContractAt(
    //   "TokenDrop",
    //   "0xce30de4e46c130403af6c6a23fd3868d16ecff71"
    // );

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

  describe("Should allow trading if active", function () {
    it("Should check that trading is active", async function () {
      const tradingActive = await token.tradingEnabled();
      expect(tradingActive).to.equal(true);
    });

    it("Should able to swap ETH for tokens", async function () {
      const receipt = await blockchainHelper.trade({
        amount: "0.02",
        direction: "buy",
        signer: addrs[0],
      });
      expect(receipt).to.not.be.null;
    });
  });

  describe("Should apply antisnipe measures", function () {
    describe("Antisnipe active", function () {
      it("Should not be able to buy more than 2% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "0.5",
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.be.null;
      });

      it("Should not be able to own more than 2% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "0.5",
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.be.null;
      });

      it("Should still be able to sell more than 2% of total supply", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const receipt = await blockchainHelper.trade({
          amount: "2",
          direction: "sell",
          signer: addrs[0],
        });
        expect(receipt).to.not.be.null;
      });
    });

    describe("Anti-snipe disabled", async function () {
      it("Should be able to buy more than 2% of total supply if antisnipe is disabled", async function () {
        await BlockchainHelper.sendEth(addrs[0]);
        const tx = await token.removeLimits();
        await tx.wait();

        const amount = "0.5";
        const amountString = amount.toString();
        const receipt = await blockchainHelper.trade({
          amount: amountString,
          direction: "buy",
          signer: addrs[0],
        });
        expect(receipt).to.not.be.null;
      });

      it("Should be able to own more than 2% of total supply if antisnipe is disabled", async function () {
        await BlockchainHelper.sendEth(addrs[0]);

        const tx = await token.removeLimits();
        await tx.wait();

        const amount = "0.5";
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
    it("Should take 20% fee from buy", async function () {
      const percentage = await blockchainHelper.tradeAndReturnTax(
        "0.02",
        "buy",
        addrs[0]
      );
      expect(percentage).to.be.closeTo(0.2, 0.01);
    });
  });

  describe("Should test swaps", () => {
    it("Should swap taxes for eth", async function () {
      await token.removeLimits();
      const { ethTradeVolume, tokenTradeVolume, totalFeesCollected } =
        await blockchainHelper.runBatchTrades(10, "buy");
      const treasury = await token.taxWallet();
      const treasuryBalance = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      const formattedTreasuryBalance = parseFloat(
        ethers.utils.formatEther(treasuryBalance)
      );

      await blockchainHelper.trade({
        amount: "100000",
        direction: "sell",
        signer: addrs[0],
      });

      const ethBalanceAfter = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      const formattedEthBalanceAfter = parseFloat(
        ethers.utils.formatEther(ethBalanceAfter)
      );

      expect(formattedEthBalanceAfter).to.be.greaterThan(
        formattedTreasuryBalance
      );
    });
  });

  describe("Should test liquidation", () => {
    it("Should renounce ownership", async function () {
      await token.renounceOwnership();
      const sellTax = await token.totalSellTax();
      const buyTax = await token.totalBuyTax();

      expect(sellTax).to.be.equal(4);
      expect(buyTax).to.be.equal(4);
    });

    it("Should swap tokens for each sell order", async function () {
      await token.renounceOwnership();
      const treasury = await token.taxWallet();
      const treasuryBalance = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      const formattedTreasuryBalance = parseFloat(
        ethers.utils.formatEther(treasuryBalance)
      );
      await blockchainHelper.trade({
        amount: "100000",
        direction: "sell",
        signer: addrs[0],
      });

      const ethBalanceAfter = await network.provider.send("eth_getBalance", [
        treasury,
      ]);
      const formattedEthBalanceAfter = parseFloat(
        ethers.utils.formatEther(ethBalanceAfter)
      );

      expect(formattedEthBalanceAfter).to.be.greaterThan(
        formattedTreasuryBalance
      );
    });
  });

  describe("should remove liquidity", () => {
    it("Should remove liquidity", async function () {
      await token.removeLimits();
      await token.updateTaxes(0, 0);

      await blockchainHelper.removeLiquidty(owner);
    });
  });
});
