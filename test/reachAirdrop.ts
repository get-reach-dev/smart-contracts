import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { solidityKeccak256 } from "ethers/lib/utils";
import hre, { ethers } from "hardhat";
import MerkleTree from "merkletreejs";
import {
  Reach,
  ReachAirdrop,
  ReachAirdrop__factory,
  Reach__factory,
} from "../typechain-types";

let addrs: HardhatEthersSigner[] = [];
let Airdrop: ReachAirdrop__factory;
let airdrop: ReachAirdrop;
let Token: Reach__factory;
let token: Reach;
let generator: Generator;
describe("Reach Airdrop", function () {
  this.beforeEach(async function () {
    addrs = await ethers.getSigners();

    // Deploy Reach token contract
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.deployed();
    const tradingTx = await token.activateTrading();
    await tradingTx.wait();
    // Deploy Airdrop contract

    const { root } = await generateMerkleTree();
    Airdrop = await ethers.getContractFactory("ReachAirdrop");
    airdrop = await Airdrop.deploy(root, token.address);
    await airdrop.deployed();

    // Transfer tokens to airdrop contract
    const tx = await token.transfer(
      airdrop.address,
      ethers.utils.parseEther("5000000")
    );
    await tx.wait();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await airdrop.owner()).to.equal(addrs[0].address);
    });
  });

  describe("Token Calculation", function () {
    it("Should calculate the correct token amount", async function () {
      const amount = await airdrop.calculateAmount("300000000000000000000000");
      const claimedAmount = parseFloat(ethers.utils.formatEther(amount[0]));
      const weekNumber = parseFloat(amount[1].toString());
      expect(claimedAmount).to.be.closeTo(10000, 1);
      expect(weekNumber).to.equal(1);
    });

    it("Should calculate the correct token amount for 3 weeks", async function () {
      //wait 3 weeks
      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 14]);
      await hre.network.provider.send("evm_mine");
      const amount2 = await airdrop.calculateAmount("300000000000000000000000");
      const claimedAmount2 = parseFloat(ethers.utils.formatEther(amount2[0]));
      const weekNumber2 = parseFloat(amount2[1].toString());
      expect(claimedAmount2).to.be.closeTo(30000, 1);
      expect(weekNumber2).to.equal(3);
    });

    it("Should calculate the correct token amount for 10 weeks", async function () {
      //wait 10 weeks
      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 66]);
      await hre.network.provider.send("evm_mine");
      const amount3 = await airdrop.calculateAmount("300000000000000000000000");
      const claimedAmount3 = parseFloat(ethers.utils.formatEther(amount3[0]));
      const weekNumber3 = parseFloat(amount3[1].toString());
      expect(claimedAmount3).to.be.closeTo(100000, 1);
      expect(weekNumber3).to.equal(10);
    });

    it("Should calculate the correct token amount for 30 weeks", async function () {
      //wait full period 30 weeks
      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 210]);
      await hre.network.provider.send("evm_mine");
      const amount4 = await airdrop.calculateAmount("300000000000000000000000");
      const claimedAmount4 = parseFloat(ethers.utils.formatEther(amount4[0]));
      const weekNumber4 = parseFloat(amount4[1].toString());
      expect(claimedAmount4).to.be.closeTo(300000, 1);
      expect(weekNumber4).to.equal(30);
    });
  });

  describe("Airdrop Claiming", function () {
    it("Should allow a valid claim", async function () {
      const recipient = addrs[1].address;
      const proof = generator.getProof(recipient);
      expect(
        await airdrop.connect(addrs[1]).claim(proof, "300000000000000000000000")
      ).to.emit(airdrop, "AirdropClaimed");

      //lost airdrop
      const lostAirdrop = parseFloat(
        ethers.utils.formatEther(await airdrop.lostAirdrop())
      );
      const lostAmount =
        (parseFloat(ethers.utils.formatEther("300000000000000000000000")) *
          29) /
        30;
      expect(lostAirdrop).to.be.closeTo(lostAmount, 1);
    });

    it("Should not allow a claim with invalid proof", async function () {
      const recipient = addrs[2].address;
      const proof = generator.getProof(recipient);
      await expect(
        airdrop.connect(addrs[1]).claim(proof, "300000000000000000000000", {
          gasLimit: 100000,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("Should not allow a claim with invalid amount", async function () {
      const recipient = addrs[1].address;
      const proof = generator.getProof(recipient);
      await expect(
        airdrop.connect(addrs[1]).claim(proof, "300000000000000000000001")
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("Sould allow claim after 3 weeks", async function () {
      const recipient = addrs[1].address;
      const proof = generator.getProof(recipient);
      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 14]);
      await hre.network.provider.send("evm_mine");
      expect(
        await airdrop.connect(addrs[1]).claim(proof, "300000000000000000000000")
      ).to.emit(airdrop, "AirdropClaimed");

      //lost airdrop
      const lostAirdrop = parseFloat(
        ethers.utils.formatEther(await airdrop.lostAirdrop())
      );
      const lostAmount =
        (parseFloat(ethers.utils.formatEther("300000000000000000000000")) *
          27) /
        30;
      expect(lostAirdrop).to.be.closeTo(lostAmount, 1);
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
    "300000000000000000000000",
    "600000000000000000000000",
    "1800000000000000000000000",
  ];

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
    this.merkleTree = new MerkleTree([], hre.ethers.utils.keccak256, {
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
      hre.ethers.utils.keccak256,
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
