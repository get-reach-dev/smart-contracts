import { ethers } from "ethers";
import { formatEther, parseEther, solidityKeccak256 } from "ethers/lib/utils";
import MerkleTree from "merkletreejs";
import fs from "fs";

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

const generateMerkleTree = async () => {
  const data = fs.readFileSync("./data/snapshot.json", "utf8");
  const snapshot = JSON.parse(data);
  console.log(snapshot.filter((r: any) => r.airdropAmount === undefined));
  const airdropRecipients = snapshot
    .filter((r: any) => r.airdropAmount !== undefined)
    .map((r: any) => ({
      address: r.wallet,
      value: parseEther((r.airdropAmount * 5).toString()).toString(),
    }));

  const generator = new Generator(airdropRecipients);
  const { root, proofs } = generator.process();

  const proofData = proofs.map((p, index) => ({
    userId: snapshot[index].userId,
    address: airdropRecipients[index].address,
    proof: p,
    amount: airdropRecipients[index].value,
  }));

  const total = airdropRecipients.reduce(
    (acc: number, curr: any) => acc + parseFloat(formatEther(curr.value)),
    0
  );
  console.log(
    "🚀 ~ file: generate-airdrop.ts:89 ~ generateMerkleTree ~ total:",
    total
  );

  fs.writeFileSync(
    "./data/merkleTree.json",
    JSON.stringify({ root, proofs: proofData }, null, 2)
  );
};

generateMerkleTree();
