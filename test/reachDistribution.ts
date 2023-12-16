import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Signer,
  ethers as e,
  parseEther,
  solidityPackedKeccak256,
} from "ethers";
import {
  Reach,
  ReachDistribution,
  ReachDistributionFactory,
  ReachDistributionFactory__factory,
  ReachDistribution__factory,
  Reach__factory,
} from "../typechain-types";

let addrs: Signer[] = [];
let Factory: ReachDistributionFactory__factory;
let factory: ReachDistributionFactory;
let Token: Reach__factory;
let token: Reach;
let Distribution: ReachDistribution__factory;
let distribution: ReachDistribution;

describe("Reach Distribution", function () {
  beforeEach(async function () {
    addrs = await ethers.getSigners();
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.waitForDeployment();
    await token.transfer(
      await addrs[1].getAddress(),
      e.parseEther("100000000")
    );
    const tx = await token.activateTrading();
    await tx.wait();
    const tokenAddress = await token.getAddress();
    Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(tokenAddress);
    await factory.waitForDeployment();
    const deployTx = await factory.deployAffiliateDistribution();
    const deployTxData = await deployTx.wait();
    const filter = factory.filters.ReachAffiliateDistributionCreated();
    const events = await factory.queryFilter(filter, -1);
    const event = events[0];
    const address = event.args[0];
    distribution = new ethers.Contract(
      address,
      ReachDistribution__factory.abi,
      addrs[0]
    ) as ReachDistribution;
  });

  describe("Eth Reserve", function () {
    it("Should be able to reserve eth allocation", async function () {
      const address = await addrs[1].getAddress();
      const messageHash = solidityPackedKeccak256(
        ["address", "uint256"],
        [address, parseEther("5")]
      );

      const bytes = e.getBytes(messageHash);
      const signature = await addrs[0].signMessage(bytes);
      const tx = await distribution
        .connect(addrs[1])
        .reserveEthAllocation(signature, parseEther("5"), {
          value: parseEther("5"),
        });
      const txData = await tx.wait();
      const filter = distribution.filters.EthAllocationReserved();
      const events = await distribution.queryFilter(filter, -1);
      const event = events[0];
      expect(event.args[0]).to.equal(address);
    });
  });
});
