import { solidityKeccak256 } from "ethers/lib/utils"; // Ethers utils
import keccak256 from "keccak256"; // Keccak256 hashing
import MerkleTree from "merkletreejs"; // MerkleTree.js

// Output file path
// const outputPath: string = path.join(__dirname, "../merkle.json");

// Airdrop recipient addresses and scaled token values
export type AirdropRecipient = {
  // Recipient address
  address: string;
  // Scaled-to-decimals token value
  ethValue: bigint;
  reachValue: bigint;
};

export default class Generator {
  // Airdrop recipients
  recipients: AirdropRecipient[] = [];
  merkleTree: MerkleTree = {} as MerkleTree;
  /**
   * Setup generator
   * @param {number} decimals of token
   * @param {Record<string, number>} airdrop address to token claim mapping
   */
  constructor(airdrop: AirdropRecipient[]) {
    this.recipients = airdrop;
  }

  /**
   * Generate Merkle Tree leaf from address and value
   * @param {string} address of airdrop claimee
   * @param {string} ethValue of airdrop tokens to claimee
   * @param {string} reachValue of airdrop tokens to claimee
   * @returns {Buffer} Merkle Tree node
   */
  generateLeaf(address: string, ethValue: string, reachValue: string): Buffer {
    return Buffer.from(
      // Hash in appropriate Merkle format
      solidityKeccak256(
        ["address", "uint256", "uint256"],
        [address, ethValue, reachValue]
      ).slice(2),
      "hex"
    );
  }

  process() {
    console;
    // Generate merkle tree
    this.merkleTree = new MerkleTree(
      // Generate leafs
      this.recipients.map(({ address, ethValue, reachValue }) =>
        this.generateLeaf(address, ethValue.toString(), reachValue.toString())
      ),
      // Hashing function
      keccak256,
      { sortPairs: true }
    );

    const proofs = this.merkleTree.getLeaves().map((leaf) => {
      return this.merkleTree.getHexProof(leaf);
    });
    // Collect and log merkle root
    const merkleRoot: string = this.merkleTree.getHexRoot();

    return { root: merkleRoot, proofs, leaves: this.merkleTree.getLeaves() };
  }

  //get proof by address
  public getProof(address: string) {
    const leaf = this.generateLeaf(
      address,
      this.recipients.find((r) => r.address === address)?.ethValue.toString() ||
        "0",
      this.recipients
        .find((r) => r.address === address)
        ?.reachValue.toString() || "0"
    );
    return this.merkleTree.getHexProof(leaf);
  }
}
