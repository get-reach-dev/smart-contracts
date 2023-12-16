import { expect } from "chai";
import { Signer, getBytes, parseEther, solidityPackedKeccak256 } from "ethers";
import { ethers } from "hardhat";
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

      const address = await addrs[1].getAddress();
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256"],
        [address, 5]
      );

      const bytes = getBytes(messageHash);
      const signature = await addrs[0].signMessage(bytes);
      const tx = await factory.connect(addrs[1]).topUp(5, signature, 5);
      await tx.wait();
      const filter = factory.filters.TopUp();
      const events = await factory.queryFilter(filter, -1);
      expect(events.length).to.equal(1);
      const factoryBalance = await token.balanceOf(await factory.getAddress());
      expect(factoryBalance).to.equal(creditPrice * BigInt(5));
    });

    it("Should not be able to buy credits with wrong signature", async function () {
      await token
        .connect(addrs[1])
        .approve(await factory.getAddress(), parseEther("100000000"));

      const address = await addrs[1].getAddress();
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256"],
        [address, 5]
      );

      const bytes = getBytes(messageHash);
      const signature = await addrs[1].signMessage(bytes);
      const tx = factory.connect(addrs[1]).topUp(5, signature, 5);
      await expect(tx).to.revertedWithCustomError(factory, "InvalidSignature");
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
});
