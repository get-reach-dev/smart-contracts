import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import Generator, { AirdropRecipient } from "../services/merkle-generator";
import {
  Reach,
  ReachMainDistribution,
  ReachMainDistribution__factory,
} from "../typechain-types";

let addrs: HardhatEthersSigner[] = [];
let token: Reach;
let Distribution: ReachMainDistribution__factory;
let distribution: ReachMainDistribution;
let generator: Generator;

const UNISWAPV2_ROUTER02_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const UNISWAPV2_ROUTER02_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("Reach Distribution", function () {
  beforeEach(async function () {
    addrs = await ethers.getSigners();
    token = await ethers.getContractAt(
      "Reach",
      "0x8b12bd54ca9b2311960057c8f3c88013e79316e3"
    );
    //impersonate the owner of the token
    const owner = "0x591136Ea7Ff955C94c832106F1Ac57348D3E047c"; // await token.owner();
    const impersonatedOwner = await ethers.getImpersonatedSigner(owner);

    await token
      .connect(impersonatedOwner)
      .transfer(addrs[1].address, ethers.utils.parseEther("100000"));

    await token
      .connect(impersonatedOwner)
      .transfer(addrs[0].address, ethers.utils.parseEther("1000000"));
    const tokenAddress = "0x8b12bd54ca9b2311960057c8f3c88013e79316e3";

    // Distribution = await ethers.getContractFactory("ReachMainDistribution");
    // distribution = await Distribution.deploy(tokenAddress);
    // await distribution.deployed();
    distribution = await ethers.getContractAt(
      "ReachMainDistribution",
      "0x921862540f5BD616313c0Fc62c49Fce077ba03cf"
    );
  });

  describe("Top Up", function () {
    it("Should be able to top up", async function () {
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      let tx = await token.approve(distribution.address, parseEther("100000"));
      await tx.wait();

      tx = await distribution.topUp(5);
      expect(tx).to.emit(distribution, "TopUp");
    });
  });
  describe.only("Create missions", function () {
    it("Should be able to create a mission", async function () {
      const uniswap = await ethers.getContractAt(
        UNISWAPV2_ROUTER02_ABI,
        UNISWAPV2_ROUTER02_ADDRESS
      );

      let amountEthFromContract = await uniswap.getAmountsOut(
        1, // 1 ETH
        [WETH_ADDRESS, token.address]
      );
      const tx = await distribution
        .connect(addrs[0])
        .createMission("1", parseEther("1"), {
          value: parseEther("1"),
        });
      expect(tx).to.emit(distribution, "MissionSet");

      const leaderboard = await distribution.leaderboardPool();
      const leader = parseFloat(ethers.utils.formatEther(leaderboard));
      const rsPool = await distribution.rsPool();
      const rs = parseFloat(ethers.utils.formatEther(rsPool));

      const balance = await network.provider.send("eth_getBalance", [
        distribution.address,
      ]);
      const balanceInWei = ethers.utils.formatEther(balance);

      const expectedLeaderboard = parseEther(
        ((BigInt(amountEthFromContract[1]) * BigInt(7)) / BigInt(10)).toString()
      );
      const expectedRsPool = parseEther(
        ((BigInt(amountEthFromContract[1]) * BigInt(1)) / BigInt(10)).toString()
      );

      const expLeader = parseFloat(
        ethers.utils.formatEther(expectedLeaderboard)
      );
      const expRs = parseFloat(ethers.utils.formatEther(expectedRsPool));

      //70% of the eth should be converted into reach in the leaderboard
      expect(expLeader).to.be.closeTo(leader, 100);
      //10% of the eth should be converted into reach in the rs pool
      expect(expRs).to.be.closeTo(rs, 100);
      //20% of the eth should be in the contract
      expect(balanceInWei).to.equal("0.2");
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
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await token.transfer(address, ethers.utils.parseEther("100000"));

      const tx = await distribution
        .connect(addrs[0])
        .createDistribution(
          root,
          ethers.utils.parseEther("6"),
          ethers.utils.parseEther("6000")
        );

      expect(tx).to.emit(distribution, "DistributionSet");
    });

    it("Should not be able to generate a distribution with unsufficient ETH", async function () {
      await expect(
        distribution
          .connect(addrs[0])
          .createDistribution(
            root,
            ethers.utils.parseEther("6"),
            ethers.utils.parseEther("6000")
          )
      ).to.be.reverted;
    });

    it("Should not be able to generate a distribution with unsufficient $reach", async function () {
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await expect(
        distribution
          .connect(addrs[0])
          .createDistribution(
            root,
            ethers.utils.parseEther("6"),
            ethers.utils.parseEther("6000")
          )
      ).to.be.reverted;
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
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await token.transfer(address, ethers.utils.parseEther("100000"));
      await distribution
        .connect(addrs[0])
        .createDistribution(
          root,
          ethers.utils.parseEther("6"),
          ethers.utils.parseEther("6000")
        );
    });

    it("Should be able to claim", async function () {
      const address = addrs[1].address;
      const ethBalanceBefore = await network.provider.send("eth_getBalance", [
        address,
      ]);
      const reachBalanceBefore = await token.balanceOf(address);
      const proof = generator.getProof(address);
      const tx = await distribution
        .connect(addrs[1])
        .claimRewards(
          proof,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1000")
        );
      expect(tx).to.emit(distribution, "RewardsClaimed");

      //make sure that user received 1eth and 1000 $reach
      const ethBalance = await network.provider.send("eth_getBalance", [
        address,
      ]);
      const diffBalance = (ethBalance - ethBalanceBefore) / 1e18;
      const reachBalance = await token.balanceOf(address);
      const diffReachBalance =
        BigInt(reachBalance - reachBalanceBefore) / BigInt(1e18);
      //should be almost 1 eth (minus gas)
      expect(diffBalance).to.be.closeTo(1, 0.01);
      expect(diffReachBalance).to.be.equal("999");
    });

    it("Should not be able to claim with invalid proof", async function () {
      const address = addrs[2].address;
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1000")
          )
      ).to.be.reverted;
    });

    it("Should not be able to claim with wrong amounts", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("2"),
            ethers.utils.parseEther("1000")
          )
      ).to.be.reverted;
    });

    it("Should not be able to claim if already claimed", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await distribution
        .connect(addrs[1])
        .claimRewards(
          proof,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1000")
        );
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1000")
          )
      ).to.be.reverted;
    });

    it("Should not be able to claim if claiming is paused", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await distribution.toggleClaiming();
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1000")
          )
      ).to.be.reverted;
    });
  });

  describe("Error management", function () {
    it("Should not be able to renounce ownership", async function () {
      await expect(distribution.renounceOwnership()).to.be.reverted;
    });
  });

  describe("Setters", function () {
    it("Should be able to set new reach token address", async function () {
      const Token = await ethers.getContractFactory("Reach");
      const newToken = await Token.deploy();
      await newToken.deployed();
      const address = newToken.address;
      await distribution.setReachAddress(address);
      const newTokenAddress = await distribution.reachToken();
      expect(newTokenAddress).to.equal(address);
    });

    it("Should fail if new token address is 0", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(distribution.setReachAddress(zeroAddress)).to.be.reverted;
    });
  });
});

const generateMerkleTree = async () => {
  const wallets = [addrs[1].address, addrs[2].address, addrs[3].address];
  const ethAmounts = [
    ethers.utils.parseEther("1"),
    ethers.utils.parseEther("2"),
    ethers.utils.parseEther("3"),
  ];
  const reachAmounts = [
    ethers.utils.parseEther("1000"),
    ethers.utils.parseEther("2000"),
    ethers.utils.parseEther("3000"),
  ];

  const airdropRecipients: AirdropRecipient[] = wallets.map((wallet, i) => {
    return {
      address: wallet,
      ethValue: ethAmounts[i] as unknown as bigint,
      reachValue: reachAmounts[i] as unknown as bigint,
    };
  });

  generator = new Generator(airdropRecipients);
  return generator.process();
};
