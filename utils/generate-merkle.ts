import { parseEther } from "ethers/lib/utils";
import Generator, { AirdropRecipient } from "../services/merkle-generator";

const generateMerkleTree = async () => {
  const wallets = [
    "0x8bf8Db631a7b17302c7bE72470b6Adb99bB02997",
    "0x47F33A4253c27dE011Dcc94Cf2910eaB030dAF03",
  ];
  const ethAmounts = [parseEther("0.00845"), parseEther("0")];
  const reachAmounts = ["230300000000000000000000", parseEther("0")];

  const airdropRecipients: AirdropRecipient[] = wallets.map((wallet, i) => {
    return {
      address: wallet,
      ethValue: ethAmounts[i] as unknown as bigint,
      reachValue: reachAmounts[i] as unknown as bigint,
    };
  });

  const generator = new Generator(airdropRecipients);
  const { root, proofs } = generator.process();

  console.log("Merkle root:", root);
  console.log("Proofs:", proofs);
};

generateMerkleTree();
