import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    mainnet: {
      url: "https://mainnet.infura.io/v3/1b30c10bf7a646ef9fcc49f304d36ce0",
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: "RZWEZ87MYSY4MR866QT9WIHDQSI6JN57KU",
  },
};

export default config;
