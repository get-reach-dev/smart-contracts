import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import Generator, { AirdropRecipient } from "../services/merkle-generator";
import {
  Reach,
  ReachAffiliateDistribution,
  ReachAffiliateDistribution__factory,
  ReachDistributionFactory,
  ReachDistributionFactory__factory,
  ReachMainDistribution,
  ReachMainDistribution__factory,
} from "../typechain-types";

let addrs: HardhatEthersSigner[] = [];
let token: Reach;
let Factory: ReachDistributionFactory__factory;
let factory: ReachDistributionFactory;
let Distribution: ReachAffiliateDistribution__factory;
let distribution: ReachAffiliateDistribution;
let MainDistribution: ReachMainDistribution__factory;
let mainDistribution: ReachMainDistribution;
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

describe("Reach Affiliate Distribution", function () {
  beforeEach(async function () {
    addrs = await ethers.getSigners();
    token = await ethers.getContractAt(
      "Reach",
      "0x8b12bd54ca9b2311960057c8f3c88013e79316e3"
    );
    //impersonate the owner of the token
    const owner = "0x591136Ea7Ff955C94c832106F1Ac57348D3E047c"; //await token.owner();
    const impersonatedOwner = await ethers.getImpersonatedSigner(owner);

    await token
      .connect(impersonatedOwner)
      .transfer(addrs[1].address, ethers.utils.parseEther("100000"));

    await token
      .connect(impersonatedOwner)
      .transfer(addrs[0].address, ethers.utils.parseEther("1000000"));
    const tokenAddress = "0x8b12bd54ca9b2311960057c8f3c88013e79316e3";

    const MainDistribution = await ethers.getContractFactory(
      "ReachMainDistribution"
    );
    mainDistribution = await MainDistribution.deploy(tokenAddress);
    await mainDistribution.deployed();

    const Factory = await ethers.getContractFactory("ReachDistributionFactory");
    factory = await Factory.deploy(tokenAddress, mainDistribution.address);
    await factory.deployed();
    await factory.deployAffiliateDistribution(addrs[0].address);
    const filter = factory.filters.ReachAffiliateDistributionCreated();
    const event = await factory.queryFilter(filter);
    const address = event[0].args[0];

    distribution = await ethers.getContractAt(
      "ReachAffiliateDistribution",
      address
    );
  });

  describe("Create missions", function () {
    it("Should be able to create a mission", async function () {
      const uniswap = await ethers.getContractAt(
        UNISWAPV2_ROUTER02_ABI,
        UNISWAPV2_ROUTER02_ADDRESS
      );

      const tx = await distribution
        .connect(addrs[0])
        .createMission("1", parseEther("1"), {
          value: parseEther("1"),
        });
      expect(tx).to.emit(distribution, "MissionSet");

      let amountEthFromContract = await uniswap.getAmountsOut(
        1, // 1 ETH
        [WETH_ADDRESS, token.address]
      );
      const leaderboard = await distribution.leaderboardPool();
      const globalPool = await distribution.globalPool();
      const leader = parseFloat(ethers.utils.formatEther(leaderboard));
      const global = parseFloat(ethers.utils.formatEther(globalPool));
      const balance = await network.provider.send("eth_getBalance", [
        distribution.address,
      ]);
      const balanceInWei = ethers.utils.formatEther(balance);

      const expectedLeaderboard = parseEther(
        (
          (BigInt(amountEthFromContract[1]) * BigInt(55)) /
          BigInt(100)
        ).toString()
      );

      const expectedGlobal = parseEther(
        (
          (BigInt(amountEthFromContract[1]) * BigInt(25)) /
          BigInt(100)
        ).toString()
      );
      const expLeader = parseFloat(
        ethers.utils.formatEther(expectedLeaderboard)
      );
      const expGlobal = parseFloat(ethers.utils.formatEther(expectedGlobal));

      //55% of the eth should be converted into reach in the leaderboard
      expect(expLeader).to.be.closeTo(leader, 500);
      expect(expGlobal).to.be.closeTo(global, 500);
      expect(balanceInWei).to.equal("0.2");
    });

    it("Should send $reach to main distribution after 50k tokens in global pool", async function () {
      await distribution.connect(addrs[0]).createMission("1", parseEther("1"), {
        value: parseEther("1"),
      });

      //create another mission
      await distribution
        .connect(addrs[0])
        .createMission("1", parseEther("10"), {
          value: parseEther("10"),
        });

      const balanceOfMainDistribution = parseFloat(
        ethers.utils.formatEther(
          await token.balanceOf(mainDistribution.address)
        )
      );

      expect(balanceOfMainDistribution).to.be.above(0);
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
      const owner = await distribution.owner();
      const impersonatedOwner = await ethers.getImpersonatedSigner(owner);
      await network.provider.send("hardhat_setBalance", [owner, amount]);

      const tx = await distribution
        .connect(impersonatedOwner)
        .createDistribution(
          root,
          ethers.utils.parseEther("6"),
          ethers.utils.parseEther("10000")
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
            ethers.utils.parseEther("10000")
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
      const owner = await distribution.owner();
      const impersonatedOwner = await ethers.getImpersonatedSigner(owner);
      //sset balance
      await network.provider.send("hardhat_setBalance", [owner, amount]);
      await distribution
        .connect(impersonatedOwner)
        .createDistribution(root, ethers.utils.parseEther("6"), 10000);
    });

    it("Should be able to claim", async function () {
      const address = addrs[1].address;
      const ethBalanceBefore = await network.provider.send("eth_getBalance", [
        address,
      ]);
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

      //should be almost 1 eth (minus gas)
      expect(diffBalance).to.be.closeTo(1, 0.01);
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
      const owner = await distribution.owner();
      const impersonatedOwner = await ethers.getImpersonatedSigner(owner);
      //sset balance
      await network.provider.send("hardhat_setBalance", [
        owner,
        "0x56BC75E2D63100000",
      ]);
      await distribution.connect(impersonatedOwner).toggleClaiming();

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
