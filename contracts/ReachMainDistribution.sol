// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {ReachDistribution} from "./ReachDistribution.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error InvalidPrice();

/**
 * @title ReachDistribution
 * @dev This contract manages the distribution of Reach tokens and Ether based on Merkle proofs.
 */
contract ReachMainDistribution is ReachDistribution {
    using SafeERC20 for IERC20;
    // Events
    event TopUp(
        address indexed user,
        uint256 balance,
        uint256 feesCollected,
        uint256 timestamp
    );
    event EthSwapped(uint256 ethAmount, uint256 reachAmount, uint256 timestamp);

    uint256 public creditPrice = 100 ether;

    // External functions
    /**
     * @dev Allows users to top up their credit balance.
     * @param _amount The amount of credits to add.
     */
    function topUp(uint256 _amount) external {
        uint256 feesCollected = _amount * creditPrice;
        IERC20(reachToken).safeTransferFrom(
            msg.sender,
            address(this),
            feesCollected
        );
        emit TopUp(msg.sender, _amount, feesCollected, block.timestamp);
    }

    // Public functions
    /**
     * @dev Sets the price for purchasing credits.
     * @param _price The new price for credits.
     */
    function setCreditPrice(uint256 _price) public onlyOwner {
        if (_price == 0) {
            revert InvalidPrice();
        }
        creditPrice = _price;
    }

    function swapEth(uint _ethAmount, uint _outputAmount) external onlyOwner {
        require(
            _ethAmount <= address(this).balance,
            "Unsufficient eth balance"
        );

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = reachToken;

        // make the swap
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: _ethAmount
        }(_outputAmount, path, address(this), block.timestamp);

        emit EthSwapped(_ethAmount, _outputAmount, block.timestamp);
    }
}
