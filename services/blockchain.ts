import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { formatEther, parseEther } from "ethers/lib/utils";
import { EthereumProvider } from "hardhat/types";
import { IUniswapV2Router02, Reach } from "../typechain-types";

type TradeInput = {
  amount: string;
  direction: "buy" | "sell";
  signer: Signer;
};

export class BlockchainHelper {
  public token: any;
  public uniswap: IUniswapV2Router02;
  public addrs: Signer[] = [];
  public provider: EthereumProvider;

  constructor(
    token: any,
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
    const tokenAddress = this.token.address;
    //convert balance to decimal from hex
    const signerAddress = await signer.getAddress();
    const wethAddress = await this.uniswap.WETH();
    const path =
      direction === "buy"
        ? [wethAddress, tokenAddress]
        : [tokenAddress, wethAddress];

    if (direction === "sell") {
      const uniswapAddress = this.uniswap.address;
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
      // console.log(e);
      return null;
    }
  }

  static sendEth = async (signer: Signer) => {
    const signerAddress = await signer.getAddress();
    const amount = "0x56BC75E2D63100000"; // 100 eth
    await network.provider.send("hardhat_setBalance", [signerAddress, amount]);
  };

  addLiquidity = async (signer: Signer) => {
    const signerAddress = await signer.getAddress();
    const amountOfEth = parseEther("1");
    const amountOfTokens = parseEther("800000000");
    const tokenAddress = this.token.address;
    const uniswapAddress = this.uniswap.address;
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
        { value: amountOfEth, gasPrice: 100000000000 }
      );
    await tx.wait();
  };

  runBatchTrades = async (trades: number, direction?: "buy" | "sell") => {
    let ethTradeVolume = 0;
    let tokenTradeVolume = 0;
    let totalFeesCollected = 0;
    let accumulatedTokens = 0;

    for (let i = 0; i < trades; i++) {
      // Randomly select a signer from the list
      const randomIndex = Math.floor(Math.random() * this.addrs.length);
      const addr = this.addrs[randomIndex];
      direction =
        direction ?? (Math.floor(Math.random() * 2) === 0 ? "buy" : "sell");
      // Random amount for buy or sell
      let amount =
        direction === "sell"
          ? Math.floor(Math.random() * 500000 + 1)
          : // for buys should be between 0.01 and 0.5
            Math.random() * 0.5 + 0.01;

      const directionInput =
        direction ?? (Math.floor(Math.random() * 2) === 0 ? "buy" : "sell");
      ethTradeVolume += directionInput === "buy" ? amount : 0;
      tokenTradeVolume += directionInput === "sell" ? amount : 0;

      const receipt = await this.trade({
        amount: amount.toString(),
        direction: directionInput,
        signer: addr,
      });

      if (receipt === null) {
        throw new Error("Trade failed");
      }

      const contractBalance = await this.token.balanceOf(this.token.address);
      accumulatedTokens += parseFloat(formatEther(contractBalance));

      const filter = this.token.filters.FeesCollected;
      const events = await this.token.queryFilter(filter, receipt?.blockNumber);
      const event = events[0];
      if (event && event.args?.value) {
        totalFeesCollected += parseFloat(
          formatEther(event.args?.value.toString())
        );
      }
    }

    return {
      ethTradeVolume,
      tokenTradeVolume,
      totalFeesCollected,
      accumulatedTokens,
    };
  };

  airdrop = async () => {
    for (const addr of this.addrs) {
      await BlockchainHelper.sendEth(addr);
      const address = await addr.getAddress();
      let tx = await this.token.transfer(address, parseEther("1000000"));
      await tx.wait();
    }
  };

  tradeAndReturnTax = async (
    amount: string,
    direction: "buy" | "sell",
    signer: Signer
  ) => {
    console.log("Trading", amount, direction);
    const tokenAddress = this.token.address;
    const contractBalanceBefore = await this.token.balanceOf(tokenAddress);
    const signertBalanceBefore = await this.token.balanceOf(
      await signer.getAddress()
    );

    const receipt = await this.trade({
      amount,
      direction,
      signer,
    });
    if (!receipt) throw new Error("Trade failed");

    const contractBalanceAfter = await this.token.balanceOf(tokenAddress);
    const signerBalance = await this.token.balanceOf(await signer.getAddress());

    const signerBalanceDiff =
      signertBalanceBefore - signerBalance > 0
        ? signertBalanceBefore - signerBalance
        : signerBalance - signertBalanceBefore;

    let diff = contractBalanceAfter - contractBalanceBefore;

    const totalTrade =
      direction === "buy" ? signerBalanceDiff + diff : signerBalanceDiff;
    if (totalTrade === 0) return 0;
    const percentage = diff / totalTrade;
    //percentage needs to be close to 5%
    const percentageInEth = parseFloat(percentage.toFixed(2));

    return percentageInEth > 0 ? percentageInEth : percentageInEth * -1;
  };

  removeLiquidty = async (signer: Signer) => {
    const signerAddress = await signer.getAddress();
    const tokenAddress = this.token.address;
    const uniswapAddress = this.uniswap.address;
    const pair = await this.token.pair();
    const pairContract = await ethers.getContractAt(uniswapV2Pair, pair);
    const weth = await this.uniswap.WETH();
    const lpBalance = await pairContract.balanceOf(signerAddress);
    const tx = await pairContract.approve(uniswapAddress, lpBalance);
    const deadline = Date.now() + 1000 * 60 * 10;
    await tx.wait();

    await this.uniswap
      .connect(signer)
      .removeLiquidity(
        tokenAddress,
        weth,
        lpBalance,
        0,
        0,
        signerAddress,
        deadline,
        {
          gasLimit: 3000000,
        }
      );
  };
}

const uniswapV2Pair = [
  {
    inputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
      { indexed: true, internalType: "address", name: "to", type: "address" },
    ],
    name: "Burn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    name: "Mint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0Out",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1Out",
        type: "uint256",
      },
      { indexed: true, internalType: "address", name: "to", type: "address" },
    ],
    name: "Swap",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint112",
        name: "reserve0",
        type: "uint112",
      },
      {
        indexed: false,
        internalType: "uint112",
        name: "reserve1",
        type: "uint112",
      },
    ],
    name: "Sync",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    constant: true,
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "MINIMUM_LIQUIDITY",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "PERMIT_TYPEHASH",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ internalType: "address", name: "to", type: "address" }],
    name: "burn",
    outputs: [
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "factory",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "_reserve0", type: "uint112" },
      { internalType: "uint112", name: "_reserve1", type: "uint112" },
      { internalType: "uint32", name: "_blockTimestampLast", type: "uint32" },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "address", name: "_token0", type: "address" },
      { internalType: "address", name: "_token1", type: "address" },
    ],
    name: "initialize",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "kLast",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ internalType: "address", name: "to", type: "address" }],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "liquidity", type: "uint256" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "nonces",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "permit",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "price0CumulativeLast",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "price1CumulativeLast",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ internalType: "address", name: "to", type: "address" }],
    name: "skim",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "uint256", name: "amount0Out", type: "uint256" },
      { internalType: "uint256", name: "amount1Out", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "swap",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [],
    name: "sync",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
];
