import { Signer, formatEther, parseEther } from "ethers";
import { network } from "hardhat";
import { EthereumProvider } from "hardhat/types";
import { IUniswapV2Router02, Reach } from "../typechain-types";

type TradeInput = {
  amount: string;
  direction: "buy" | "sell";
  signer: Signer;
};

export class BlockchainHelper {
  public token: Reach;
  public uniswap: IUniswapV2Router02;
  public addrs: Signer[] = [];
  public provider: EthereumProvider;

  constructor(
    token: Reach,
    uniswap: IUniswapV2Router02,
    addrs: Signer[],
    provider: EthereumProvider
  ) {
    this.token = token;
    this.uniswap = uniswap;
    this.addrs = addrs;
    this.provider = provider;
  }

  public async trade({ amount, direction, signer }: TradeInput) {
    const amountInWei = parseEther(amount);
    const tokenAddress = await this.token.getAddress();
    //convert balance to decimal from hex
    const signerAddress = await signer.getAddress();
    const wethAddress = await this.uniswap.WETH();
    const path =
      direction === "buy"
        ? [wethAddress, tokenAddress]
        : [tokenAddress, wethAddress];

    if (direction === "sell") {
      const uniswapAddress = await this.uniswap.getAddress();
      const tx = await this.token
        .connect(signer)
        .approve(uniswapAddress, parseEther("1000000000000000000"));
      await tx.wait();
    }

    try {
      const data =
        direction === "buy"
          ? await this.uniswap
              .connect(signer)
              .swapExactETHForTokens(
                0,
                path,
                signerAddress,
                Date.now() + 1000 * 60 * 10,
                {
                  value: amountInWei,
                }
              )
          : await this.uniswap
              .connect(signer)
              .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountInWei,
                0,
                path,
                signerAddress,
                Date.now() + 1000 * 60 * 10
              );

      const receipt = await data.wait();
      return receipt;
    } catch (e) {
      throw e;
    }
  }

  sendEth = async (signer: Signer) => {
    const signerAddress = await signer.getAddress();
    const amount = "0x56BC75E2D63100000"; // 100 eth
    await network.provider.send("hardhat_setBalance", [signerAddress, amount]);
  };

  addLiquidity = async (signer: Signer) => {
    const signerAddress = await signer.getAddress();
    const amountOfEth = parseEther("75");
    const amountOfTokens = parseEther("7500000");
    const tokenAddress = await this.token.getAddress();
    const uniswapAddress = await this.uniswap.getAddress();
    await this.token.approve(uniswapAddress, amountOfTokens);
    await this.uniswap
      .connect(signer)
      .addLiquidityETH(
        tokenAddress,
        amountOfTokens,
        0,
        0,
        signerAddress,
        Date.now() + 1000 * 60 * 10,
        { value: amountOfEth }
      );
  };

  runBatchTrades = async (trades: number, direction?: "buy" | "sell") => {
    let runs = 0;
    let ethTradeVolume = 0;
    let tokenTradeVolume = 0;
    let totalFeesCollected = 0;
    for (const addr of this.addrs) {
      //amount should be random between 1 and 30
      let amount = Math.floor(Math.random() * 30 + 1);

      const directionInput =
        direction ?? Math.floor(Math.random() * 2) === 0 ? "buy" : "sell";

      if (directionInput === "sell") {
        amount = Math.floor(Math.random() * 100000 + 1);
      }

      ethTradeVolume += directionInput === "buy" ? amount : 0;
      tokenTradeVolume += directionInput === "sell" ? amount : 0;

      const receipt = await this.trade({
        amount: amount.toString(),
        direction: directionInput,
        signer: addr,
      });

      const filter = this.token.filters.FeesCollected;
      const events = await this.token.queryFilter(filter, receipt?.blockNumber);
      const event = events[0];
      if (event) {
        totalFeesCollected += parseFloat(
          formatEther(event.args?.amount.toString())
        );
      }
      //check if FeesCollected event is emitted

      runs++;

      if (runs === trades) {
        break;
      }
    }

    return {
      ethTradeVolume,
      tokenTradeVolume,
      totalFeesCollected,
    };
  };

  airdrop = async () => {
    for (const addr of this.addrs) {
      await this.sendEth(addr);
      await this.token.transfer(addr, parseEther("100000"));
    }
  };
}
