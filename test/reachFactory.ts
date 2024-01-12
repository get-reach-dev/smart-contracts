import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  Reach,
  ReachDistributionFactory,
  ReachDistributionFactory__factory,
  ReachMainDistribution,
  ReachMainDistribution__factory,
  Reach__factory,
} from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

let addrs: HardhatEthersSigner[] = [];
let Factory: ReachDistributionFactory__factory;
let factory: ReachDistributionFactory;
let Distribution: ReachMainDistribution__factory;
let distribution: ReachMainDistribution;
let Token: Reach__factory;
let token: Reach;
let creditPrice: bigint;

describe("Reach Factory", function () {
  this.beforeEach(async function () {
    addrs = await ethers.getSigners();
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.deployed();
    await token.transfer(
      addrs[1].address,
      ethers.utils.parseEther("100000000")
    );
    const tx = await token.activateTrading();
    await tx.wait();
    const tokenAddress = token.address;

    Distribution = await ethers.getContractFactory("ReachMainDistribution");
    distribution = await Distribution.deploy(tokenAddress);
    await distribution.deployed();
    Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(tokenAddress, distribution.address);

    await factory.deployed();
  });
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await factory.owner()).to.equal(addrs[0].address);
    });
  });

  describe("Deploy affiliate", function () {
    it("Should be able to deploy an affiliate", async function () {
      const tx = await factory.deployAffiliateDistribution(addrs[1].address);
      await tx.wait();
      const filter = factory.filters.ReachAffiliateDistributionCreated();
      const events = await factory.queryFilter(filter, -1);
      expect(events.length).to.equal(1);
    });
  });

  describe("Setters", function () {
    it("Should be able to set new reach token address", async function () {
      const newToken = await Token.deploy();
      await newToken.deployed();
      const address = newToken.address;
      await factory.setToken(address);
      const newTokenAddress = await factory.reachToken();
      expect(newTokenAddress).to.equal(address);
    });

    it("Should fail if new token address is 0", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(factory.setToken(zeroAddress)).to.be.reverted;
    });

    it("Should fail if address is not a token", async function () {
      await expect(factory.setToken(await addrs[1].getAddress())).to.be
        .reverted;
    });
  });

  describe("Error management", function () {
    it("Should not be able to renounce ownership", async function () {
      await expect(factory.renounceOwnership()).to.be.reverted;
    });
  });
});
