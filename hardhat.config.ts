import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import { configDotenv } from "dotenv";
configDotenv();

const config: HardhatUserConfig = {
  solidity: "0.8.19",
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/1b30c10bf7a646ef9fcc49f304d36ce0`,
        blockNumber: 18766931,
      },
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`], // Replace with your private key
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`], // Replace with your private key
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_KEY}}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`], // Replace with your private key
    },
  },
  etherscan: {
    apiKey: "RZWEZ87MYSY4MR866QT9WIHDQSI6JN57KU",
  },
};

export default config;
