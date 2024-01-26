import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import fs from "fs";
import hre, { ethers } from "hardhat";
import {
  Reach,
  ReachAirdrop,
  ReachAirdrop__factory,
  Reach__factory,
} from "../typechain-types";
import { formatEther } from "ethers/lib/utils";
let addrs: HardhatEthersSigner[] = [];
let Airdrop: ReachAirdrop__factory;
let airdrop: ReachAirdrop;
let Token: Reach__factory;
let token: Reach;
let merkleTree: {
  root: string;
  proofs: {
    userId: string;
    address: string;
    proof: string[];
    amount: string;
  }[];
};
describe.skip("Reach Airdrop", function () {
  this.beforeEach(async function () {
    addrs = await ethers.getSigners();

    // Deploy Reach token contract
    Token = await ethers.getContractFactory("Reach");
    token = await Token.deploy();
    await token.deployed();
    const tradingTx = await token.activateTrading();
    await tradingTx.wait();
    // Deploy Airdrop contract

    merkleTree = JSON.parse(fs.readFileSync("./data/merkleTree.json", "utf-8"));

    Airdrop = await ethers.getContractFactory("ReachAirdrop");
    airdrop = await Airdrop.deploy(merkleTree.root, token.address);
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
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);

      expect(
        await airdrop.connect(impersonatedOwner).claim(proof, amount)
      ).to.emit(airdrop, "AirdropClaimed");

      //lost airdrop
      const lostAirdrop = parseFloat(
        ethers.utils.formatEther(await airdrop.lostAirdrop())
      );
      const lostAmount =
        (parseFloat(ethers.utils.formatEther(amount)) * 29) / 30;
      expect(lostAirdrop).to.be.closeTo(lostAmount, 1);
    });

    it("Should not allow a claim with invalid proof", async function () {
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);

      await expect(
        airdrop.connect(addrs[1]).claim(proof, "300000000000000000000000", {
          gasLimit: 100000,
        })
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("Should not allow a claim with invalid amount", async function () {
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);
      await expect(
        airdrop.connect(addrs[1]).claim(proof, "300000000000000000000001")
      ).to.be.revertedWith("Invalid Merkle proof");
    });

    it("Sould allow claim after 3 weeks", async function () {
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);

      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 14]);
      await hre.network.provider.send("evm_mine");
      expect(
        await airdrop.connect(impersonatedOwner).claim(proof, amount)
      ).to.emit(airdrop, "AirdropClaimed");

      //lost airdrop
      const lostAirdrop = parseFloat(
        ethers.utils.formatEther(await airdrop.lostAirdrop())
      );
      const lostAmount =
        (parseFloat(ethers.utils.formatEther(amount)) * 27) / 30;
      expect(lostAirdrop).to.be.closeTo(lostAmount, 1);
    });
  });

  describe("Withdraw Tokens", function () {
    it("Should allow owner to withdraw tokens", async function () {
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);

      await airdrop.connect(impersonatedOwner).claim(proof, amount);
      const lostTokens = await airdrop.lostAirdrop();
      const ownerBalanceBefore = await token.balanceOf(addrs[0].address);
      await airdrop.withdrawLostTokens();
      const ownerBalanceAfter =
        parseFloat(formatEther(ownerBalanceBefore)) +
        parseFloat(formatEther(lostTokens));

      expect(
        parseFloat(formatEther(await token.balanceOf(addrs[0].address)))
      ).to.equal(ownerBalanceAfter);
    });

    it("Should be able to withdraw all funds after 34 weeks", async function () {
      const { address, proof, amount } = merkleTree.proofs[0];

      const impersonatedOwner = await ethers.getImpersonatedSigner(address);

      await hre.network.provider.send("evm_increaseTime", [60 * 60 * 24 * 238]);
      await hre.network.provider.send("evm_mine");
      await airdrop.connect(impersonatedOwner).claim(proof, amount);
      const ownerBalanceBefore = await token.balanceOf(addrs[0].address);
      const contractBalance = await token.balanceOf(airdrop.address);
      await airdrop.withdrawLostTokens();
      //convert amounts from hex to eth
      const ownerBalanceAfter =
        parseFloat(formatEther(ownerBalanceBefore)) +
        parseFloat(formatEther(contractBalance));
      expect(
        parseFloat(formatEther(await token.balanceOf(addrs[0].address)))
      ).to.equal(ownerBalanceAfter);
    });
  });
});
