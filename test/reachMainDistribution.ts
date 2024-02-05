import { expect } from "chai";
import { Signer } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import Generator, { AirdropRecipient } from "../services/merkle-generator";
import {
  Reach,
  ReachMainDistribution,
  ReachMainDistribution__factory,
} from "../typechain-types";

let addrs: Signer[] = [];
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
      .transfer(await addrs[1].getAddress(), ethers.utils.parseEther("100000"));

    await token
      .connect(impersonatedOwner)
      .transfer(
        await addrs[0].getAddress(),
        ethers.utils.parseEther("1000000")
      );
    const tokenAddress = "0x8b12bd54ca9b2311960057c8f3c88013e79316e3";

    Distribution = await ethers.getContractFactory("ReachMainDistribution");
    distribution = await Distribution.deploy();
    await distribution.deployed();
  });

  describe("Top Up", function () {
    it("Should be able to top up", async function () {
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      let tx = await token.approve(distribution.address, parseEther("100000"));
      await tx.wait();

      tx = await distribution.topUp(5);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;
      expect(tx).to.emit(distribution, "TopUp");
    });
  });

  describe("Create missions", function () {
    it("Should be able to create a mission", async function () {
      const tx = await distribution.connect(addrs[0]).createMission("1", {
        value: parseEther("1"),
      });
      expect(tx).to.emit(distribution, "MissionCreated");

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;
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

      const tx = await distribution.pauseClaiming();
      await tx.wait();
    });

    it("Should generate a merkle tree with some wallets", async function () {
      const address = distribution.address;
      const amount = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [address, amount]);
      await token.transfer(address, ethers.utils.parseEther("100000"));

      const tx = await distribution.connect(addrs[0]).createDistribution(root);

      expect(tx).to.emit(distribution, "DistributionSet");
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
      const tx = await distribution.pauseClaiming();
      await tx.wait();
      await distribution.connect(addrs[0]).createDistribution(root);
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
        .claimRewards(
          proof,
          ethers.utils.parseEther("0.1"),
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
        parseFloat(formatEther(reachBalance)) -
        parseFloat(formatEther(reachBalanceBefore));
      //should be almost 1 eth (minus gas)
      expect(diffBalance).to.be.closeTo(0.1, 0.01);
      expect(diffReachBalance).to.be.equal(1000);
    });

    it("Should not be able to claim with invalid proof", async function () {
      const address = await addrs[2].getAddress();
      const proof = generator.getProof(address);
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("1000")
          )
      ).to.be.reverted;
    });

    it("Should not be able to claim with wrong amounts", async function () {
      const address = await addrs[1].getAddress();
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
      const address = await addrs[1].getAddress();
      const proof = generator.getProof(address);
      await distribution
        .connect(addrs[1])
        .claimRewards(
          proof,
          ethers.utils.parseEther("0.1"),
          ethers.utils.parseEther("1000")
        );
      await expect(
        distribution
          .connect(addrs[1])
          .claimRewards(
            proof,
            ethers.utils.parseEther("0.1"),
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

  describe("Swap", function () {
    it("Should not be able to swap if not owner", async function () {
      const uniswap = await ethers.getContractAt(
        UNISWAPV2_ROUTER02_ABI,
        UNISWAPV2_ROUTER02_ADDRESS
      );

      let amountOut = await uniswap.getAmountsOut(
        1, // 1 ETH
        [WETH_ADDRESS, token.address]
      );
      await expect(
        distribution.connect(addrs[1]).swapEth(parseEther("1"), amountOut[1])
      ).to.be.reverted;
    });

    it("Should be able to swap", async function () {
      const uniswap = await ethers.getContractAt(
        UNISWAPV2_ROUTER02_ABI,
        UNISWAPV2_ROUTER02_ADDRESS
      );

      let amountOut = await uniswap.getAmountsOut(
        parseEther("1"), // 1 ETH
        [WETH_ADDRESS, token.address]
      );

      //transfer 1 eth to the contract
      const amountToSend = "0x56BC75E2D63100000"; // 100 eth
      await network.provider.send("hardhat_setBalance", [
        distribution.address,
        amountToSend,
      ]);

      const tx = await distribution.swapEth(parseEther("1"), amountOut[1]);

      expect(tx).to.emit(distribution, "EthSwapped");
    });
  });
});

const generateMerkleTree = async () => {
  const wallets = [
    await addrs[1].getAddress(),
    await addrs[2].getAddress(),
    await addrs[3].getAddress(),
  ];
  const ethAmounts = [
    ethers.utils.parseEther("0.1"),
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
