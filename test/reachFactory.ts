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
    distribution = await Distribution.deploy();
    await distribution.deployed();
    Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(distribution.address);

    await factory.deployed();
  });
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await factory.owner()).to.equal(addrs[0].address);
    });
  });

  describe("Deploy affiliate", function () {
    it("Should be able to deploy an affiliate", async function () {
      const tx = await factory.deployAffiliateDistribution("test");
      await tx.wait();
      const filter = factory.filters.ReachAffiliateDistributionCreated();
      const events = await factory.queryFilter(filter, -1);
      expect(events.length).to.equal(1);
    });
  });

  describe("Error management", function () {
    it("Should not be able to renounce ownership", async function () {
      await expect(factory.renounceOwnership()).to.be.reverted;
    });
  });
});
