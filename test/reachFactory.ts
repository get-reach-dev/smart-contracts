import { expect } from "chai";
import { Signer, parseEther } from "ethers";
import { ethers, network } from "hardhat";
import {
  Reach,
  ReachDistributionFactory,
  ReachDistributionFactory__factory,
  Reach__factory,
} from "../typechain-types";

let addrs: Signer[] = [];
let Factory: ReachDistributionFactory__factory;
let factory: ReachDistributionFactory;
let Token: Reach__factory;
let token: Reach;
let creditPrice: bigint;

describe("Reach Factory", function () {
  this.beforeEach(async function () {
    addrs = await ethers.getSigners();
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.waitForDeployment();
    await token.transfer(await addrs[1].getAddress(), parseEther("100000000"));
    const tx = await token.activateTrading();
    await tx.wait();
    const tokenAddress = await token.getAddress();
    Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(tokenAddress);
    creditPrice = await factory.creditPrice();

    await factory.waitForDeployment();
  });
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await factory.owner()).to.equal(await addrs[0].getAddress());
    });
  });

  describe("Credits", function () {
    it("Should be able to buy credits", async function () {
      await token
        .connect(addrs[1])
        .approve(await factory.getAddress(), parseEther("100000000"));
      const tx = await factory.connect(addrs[1]).topUp(5);
      await tx.wait();
      const filter = factory.filters.TopUp();
      const events = await factory.queryFilter(filter, -1);
      expect(events.length).to.equal(1);
      const factoryBalance = await token.balanceOf(await factory.getAddress());
      expect(factoryBalance).to.equal(creditPrice * BigInt(5));
    });

    it("Should fail if not enough tokens", async function () {
      await expect(factory.connect(addrs[1]).topUp(100000000)).to.be.reverted;
    });
  });

  describe("Deploy affiliate", function () {
    it("Should be able to deploy an affiliate", async function () {
      const tx = await factory.deployAffiliateDistribution();
      await tx.wait();
      const filter = factory.filters.ReachAffiliateDistributionCreated();
      const events = await factory.queryFilter(filter, -1);
      expect(events.length).to.equal(1);
    });
  });

  describe("Setters", function () {
    it("Should be able to set a new credit price", async function () {
      await factory.setCreditPrice(100);
      const newCreditPrice = await factory.creditPrice();
      expect(newCreditPrice).to.equal(100);
    });

    it("Should fail if credit = 0", async function () {
      await expect(factory.setCreditPrice(0)).to.be.revertedWithCustomError(
        factory,
        "InvalidPrice"
      );
    });

    it("Should be able to set new reach token address", async function () {
      const newToken = await Token.deploy();
      await newToken.waitForDeployment();
      const address = await newToken.getAddress();
      await factory.setToken(address);
      const newTokenAddress = await factory.reachToken();
      expect(newTokenAddress).to.equal(address);
    });

    it("Should fail if new token address is 0", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(factory.setToken(zeroAddress)).to.be.revertedWithCustomError(
        factory,
        "InvalidTokenAddress"
      );
    });

    it("Should fail if address is not a token", async function () {
      await expect(factory.setToken(await addrs[1].getAddress())).to.be
        .reverted;
    });
  });

  describe("Withdrawals", function () {
    it("Should be able to withdraw eth", async function () {
      //send eth to factory
      const value = "0x56BC75E2D63100000";
      await network.provider.request({
        method: "hardhat_setBalance",
        params: [await factory.getAddress(), value],
      });

      const initialBalance = await ethers.provider.getBalance(
        await addrs[0].getAddress()
      );
      const tx = await factory.withdrawETH();
      await tx.wait();
      const balance = await ethers.provider.getBalance(
        await addrs[0].getAddress()
      );

      expect(balance).to.be.above(initialBalance);
    });

    it("Should be able to withdraw tokens", async function () {
      //top up credits
      await token
        .connect(addrs[1])
        .approve(await factory.getAddress(), parseEther("100000000"));
      let tx = await factory.connect(addrs[1]).topUp(1);
      const initialBalance = await token.balanceOf(await addrs[0].getAddress());
      tx = await factory.withdrawTokens();
      await tx.wait();
      const balance = await token.balanceOf(await addrs[0].getAddress());
      const diff = balance - initialBalance;
      const creditPrice = await factory.creditPrice();

      expect(diff).to.be.equal(creditPrice);
    });
  });

  describe("Error management", function () {
    it("Should not be able to renounce ownership", async function () {
      await expect(factory.renounceOwnership()).to.be.reverted;
    });
  });
});
