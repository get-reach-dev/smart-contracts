import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther, solidityKeccak256 } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import {
  Reach,
  ReachAffiliateDistribution,
  ReachAffiliateDistribution__factory,
  ReachDistributionFactory,
  ReachDistributionFactory__factory,
  ReachMainDistribution,
  ReachMainDistribution__factory,
} from "../typechain-types";
import MerkleTree from "merkletreejs";

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
      "0xF5374A7aEDD194bc7f42425fd68ED382a2C13A25"
    );
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

      const leaderboard = await mainDistribution.leaderboardPool();
      const leader = parseFloat(ethers.utils.formatEther(leaderboard));
      const rsPool = await mainDistribution.rsPool();
      const rs = parseFloat(ethers.utils.formatEther(rsPool));

      const balance = await network.provider.send("eth_getBalance", [
        distribution.address,
      ]);
      const balanceInWei = ethers.utils.formatEther(balance);

      const expectedLeaderboard = parseEther(
        (
          (BigInt(amountEthFromContract[1]) * BigInt(15)) /
          BigInt(100)
        ).toString()
      );
      const expectedRsPool = parseEther(
        (
          (BigInt(amountEthFromContract[1]) * BigInt(10)) /
          BigInt(100)
        ).toString()
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
      expect(balanceInWei).to.equal("0.75");
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
        .createDistribution(root, ethers.utils.parseEther("6"));

      expect(tx).to.emit(distribution, "DistributionSet");
    });

    it("Should not be able to generate a distribution with unsufficient ETH", async function () {
      await expect(
        distribution
          .connect(addrs[0])
          .createDistribution(root, ethers.utils.parseEther("6"))
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
        .createDistribution(root, ethers.utils.parseEther("6"));
    });

    it("Should be able to claim", async function () {
      const address = addrs[1].address;
      const ethBalanceBefore = await network.provider.send("eth_getBalance", [
        address,
      ]);
      const proof = generator.getProof(address);
      const tx = await distribution
        .connect(addrs[1])
        .claimRewards(proof, ethers.utils.parseEther("1"));
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
          .claimRewards(proof, ethers.utils.parseEther("1"))
      ).to.be.reverted;
    });

    it("Should not be able to claim with wrong amounts", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, ethers.utils.parseEther("2"))
      ).to.be.reverted;
    });

    it("Should not be able to claim if already claimed", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await distribution
        .connect(addrs[1])
        .claimRewards(proof, ethers.utils.parseEther("1"));
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, ethers.utils.parseEther("1"))
      ).to.be.reverted;
    });

    it("Should not be able to claim if claiming is paused", async function () {
      const address = addrs[1].address;
      const proof = generator.getProof(address);
      await distribution.toggleClaiming();
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(proof, ethers.utils.parseEther("1"))
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
  const wallets = [
    await addrs[1].getAddress(),
    await addrs[2].getAddress(),
    await addrs[3].getAddress(),
  ];

  const ethAmounts = [parseEther("1"), parseEther("2"), parseEther("3")];

  const airdropRecipients: AirdropRecipient[] = wallets.map((wallet, i) => {
    return {
      address: wallet,
      value: ethAmounts[i] as unknown as bigint,
    };
  });

  generator = new Generator(airdropRecipients);
  return generator.process();
};

type AirdropRecipient = {
  address: string;
  value: bigint;
};
export default class Generator {
  recipients: AirdropRecipient[] = [];
  merkleTree: MerkleTree;

  constructor(airdrop: AirdropRecipient[]) {
    this.recipients = airdrop;
    this.merkleTree = new MerkleTree([], ethers.utils.keccak256, {
      sortPairs: true,
    });
  }

  generateLeaf(address: string, value: bigint): Buffer {
    return Buffer.from(
      solidityKeccak256(
        ["address", "uint256"],
        [address, value.toString()]
      ).slice(2),
      "hex"
    );
  }

  process(): { root: string; proofs: string[][]; leaves: Buffer[] } {
    this.merkleTree = new MerkleTree(
      this.recipients.map(({ address, value }) =>
        this.generateLeaf(address, value)
      ),
      ethers.utils.keccak256,
      { sortPairs: true }
    );

    const proofs = this.merkleTree
      .getLeaves()
      .map((leaf) => this.merkleTree.getHexProof(leaf));

    const merkleRoot: string = this.merkleTree.getHexRoot();

    return {
      root: merkleRoot,
      proofs,
      leaves: this.merkleTree.getLeaves(),
    };
  }

  getProof(address: string): string[] {
    const recipient = this.recipients.find((r) => r.address === address);
    if (!recipient) {
      throw new Error("Address not found in airdrop list");
    }

    const leaf = this.generateLeaf(address, recipient.value);
    return this.merkleTree.getHexProof(leaf);
  }
}
