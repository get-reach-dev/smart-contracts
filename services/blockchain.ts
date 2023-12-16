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
        .approve(uniswapAddress, parseEther("100000000"));
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
      return null;
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
    let tx = await this.token.approve(uniswapAddress, amountOfTokens);
    await tx.wait();
    tx = await this.uniswap
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
    await tx.wait();
  };

  runBatchTrades = async (trades: number, direction?: "buy" | "sell") => {
    let runs = 0;
    let ethTradeVolume = 0;
    let tokenTradeVolume = 0;
    let totalFeesCollected = 0;
    for (const addr of this.addrs) {
      //amount should be random between 1 and 30
      let amount = Math.floor(Math.random() * 10 + 1);

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
      let tx = await this.token.transfer(addr, parseEther("100000"));
      await tx.wait();
    }
  };

  tradeAndReturnTax = async (
    amount: string,
    direction: "buy" | "sell",
    signer: Signer
  ) => {
    const tokenAddress = await this.token.getAddress();
    const contractBalanceBefore = await this.token.balanceOf(tokenAddress);
    const signertBalanceBefore = await this.token.balanceOf(
      await signer.getAddress()
    );
    await this.trade({
      amount,
      direction,
      signer,
    });
    const contractBalanceAfter = await this.token.balanceOf(tokenAddress);
    const signerBalance = await this.token.balanceOf(await signer.getAddress());
    const signerBalanceDiff =
      signertBalanceBefore - signerBalance > 0
        ? signertBalanceBefore - signerBalance
        : signerBalance - signertBalanceBefore;
    const diff = contractBalanceAfter - contractBalanceBefore;
    const totalTrade =
      direction === "buy" ? signerBalanceDiff + diff : signerBalanceDiff;
    if (totalTrade === BigInt(0)) return 0;
    const percentage = (diff * BigInt(1e18)) / totalTrade;
    //percentage needs to be close to 5%
    const percentageInEth = parseFloat(formatEther(percentage));
    return percentageInEth;
  };
}
