import { expect } from "chai";
import {
  Signer,
  ethers as e,
  formatEther,
  parseEther,
  solidityPackedKeccak256,
} from "ethers";
import { ethers, network } from "hardhat";
import Generator, { AirdropRecipient } from "../services/merkle-generator";
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
let generator: Generator;
describe("Reach Distribution", function () {
  beforeEach(async function () {
    addrs = await ethers.getSigners();
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.waitForDeployment();
    await token.transfer(await addrs[1].getAddress(), e.parseEther("100000"));
    const tx = await token.activateTrading();
    await tx.wait();
    const tokenAddress = await token.getAddress();
    Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(tokenAddress);
    await factory.waitForDeployment();
    const deployTx = await factory.deployAffiliateDistribution();
    await deployTx.wait();
    const filter = factory.filters.ReachAffiliateDistributionCreated();
    const events = await factory.queryFilter(filter, -1);
    const event = events[0];
    const address = event.args[0];
    distribution = new ethers.Contract(
      address,
      ReachDistribution__factory.abi,
      addrs[0]
    ) as ReachDistribution;
    await distribution.acceptOwnership();
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
      const tx = await distribution.connect(addrs[1]).reserveEthAllocation({
        value: parseEther("5"),
      });
      const txData = await tx.wait();
      const filter = distribution.filters.EthAllocationReserved();
      const events = await distribution.queryFilter(filter, -1);
      const event = events[0];
      expect(event.args[0]).to.equal(address);
    });
  });

  describe("Create distribution", function () {
    let root: string;
    let proofs: string[][];
    let leaves: Buffer[];

    this.beforeEach(async function () {
      const data = await generateMerkleTree();
      root = data.root;
      proofs = data.proofs;
      leaves = data.leaves;
    });

    it("Should generate a merkle tree with some wallets", async function () {
      const address = await distribution.getAddress();
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await token.transfer(address, e.parseEther("100000"));

      const tx = await distribution
        .connect(addrs[0])
        .createDistribution(root, parseEther("6"), parseEther("6000"));

      expect(tx).to.emit(distribution, "DistributionSet");
    });

    it("Should not be able to generate a distribution with unsufficient ETH", async function () {
      await expect(
        distribution
          .connect(addrs[0])
          .createDistribution(root, parseEther("6"), parseEther("6000"))
      ).to.be.revertedWithCustomError(distribution, "UnsufficientEthBalance");
    });

    it("Should not be able to generate a distribution with unsufficient $reach", async function () {
      const address = await distribution.getAddress();
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);

      await expect(
        distribution
          .connect(addrs[0])
          .createDistribution(root, parseEther("6"), parseEther("6000"))
      ).to.be.revertedWithCustomError(distribution, "UnsufficientReachBalance");
    });
  });

  describe("Claim", function () {
    let root: string;
    let proofs: string[][];
    let leaves: Buffer[];
    this.beforeEach(async function () {
      const data = await generateMerkleTree();
      root = data.root;
      proofs = data.proofs;
      leaves = data.leaves;
      const address = await distribution.getAddress();
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await token.transfer(address, e.parseEther("100000"));
      await distribution
        .connect(addrs[0])
        .createDistribution(root, parseEther("6"), parseEther("6000"));
    });

    it("Should be able to claim", async function () {
      const address = await addrs[1].getAddress();
      const ethBalanceBefore = await network.provider.send("eth_getBalance", [
        address,
      ]);
      const reachBalanceBefore = await token.balanceOf(address);
      const proof = generator.getProof(address);
      const tx = await distribution
        .connect(addrs[1])
        .claimRewards(proof, parseEther("1"), parseEther("1000"));
      expect(tx).to.emit(distribution, "RewardsClaimed");

      //make sure that user received 1eth and 1000 $reach
      const ethBalance = await network.provider.send("eth_getBalance", [
        address,
      ]);
      const diffBalance = (ethBalance - ethBalanceBefore) / 1e18;
      const reachBalance = await token.balanceOf(address);
      const diffReachBalance = reachBalance - reachBalanceBefore;
      //should be almost 1 eth (minus gas)
      expect(diffBalance).to.be.closeTo(1, 0.01);
      expect(diffReachBalance).to.be.equal(parseEther("1000"));
    });

    it("Should not be able to claim with invalid proof", async function () {
      const address = await addrs[2].getAddress();
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, parseEther("1"), parseEther("1000"))
      ).to.be.revertedWithCustomError(distribution, "InvalidMerkleProof");
    });

    it("Should not be able to claim with wrong amounts", async function () {
      const address = await addrs[1].getAddress();
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, parseEther("2"), parseEther("1000"))
      ).to.be.revertedWithCustomError(distribution, "InvalidMerkleProof");
    });

    it("Should not be able to claim if already claimed", async function () {
      const address = await addrs[1].getAddress();
      const proof = generator.getProof(address);
      await distribution
        .connect(addrs[1])
        .claimRewards(proof, parseEther("1"), parseEther("1000"));
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, parseEther("1"), parseEther("1000"))
      ).to.be.revertedWithCustomError(distribution, "AlreadyClaimed");
    });

    it("Should not be able to claim if claiming is paused", async function () {
      const address = await addrs[1].getAddress();
      const proof = generator.getProof(address);
      await distribution.toggleClaiming();
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, parseEther("1"), parseEther("1000"))
      ).to.be.revertedWithCustomError(distribution, "ClaimingPaused");
    });
  });

  describe("Error management", function () {
    it("Should not be able to renounce ownership", async function () {
      await expect(distribution.renounceOwnership()).to.be.reverted;
    });

    it("Should not be able to reserve below min allocation", async function () {
      await expect(
        distribution.reserveEthAllocation({
          value: parseEther("0.000000000000000001"),
        })
      ).to.be.revertedWithCustomError(
        distribution,
        "UnsufficientEthAllocation"
      );
    });
  });

  describe("Setters", function () {
    it("Should set min eth allocation", async function () {
      const tx = await distribution.setMinEthAllocation(parseEther("1"));
      const minEthAllocation = await distribution.minEthAllocation();
      expect(minEthAllocation).to.equal(parseEther("1"));
    });

    it("Should not be able to set min eth allocation to 0", async function () {
      await expect(
        distribution.setMinEthAllocation(parseEther("0"))
      ).to.be.revertedWithCustomError(
        distribution,
        "UnsufficientEthAllocation"
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
      await expect(
        distribution.setReachAddress(zeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidTokenAddress");
    });

    it("Should fail if address is not a token", async function () {
      await expect(distribution.setReachAddress(await addrs[1].getAddress())).to
        .be.reverted;
    });
  });
});

const generateMerkleTree = async () => {
  const wallets = [
    await addrs[1].getAddress(),
    await addrs[2].getAddress(),
    await addrs[3].getAddress(),
  ];
  const ethAmounts = [parseEther("1"), parseEther("2"), parseEther("3")];
  const reachAmounts = [
    parseEther("1000"),
    parseEther("2000"),
    parseEther("3000"),
  ];

  const airdropRecipients: AirdropRecipient[] = wallets.map((wallet, i) => {
    return {
      address: wallet,
      ethValue: ethAmounts[i],
      reachValue: reachAmounts[i],
    };
  });

  generator = new Generator(airdropRecipients);
  return generator.process();
};
