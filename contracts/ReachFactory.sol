// SPDX-License-Identifier: unlicensed
pragma solidity 0.8.19;

import "./ReachDistributionV2.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error InvalidPrice();
error TopUpError();

/**
 * @title ReachDistributionFactory
 * @dev This contract allows for the management of Reach token distributions.
 */
contract ReachDistributionFactory is Ownable2Step {
    using SafeERC20 for IERC20;

    // Events
    event ReachAffiliateDistributionCreated(
        address indexed distribution,
        uint256 timestamp
    );
    event PricesSet(
        uint256 credits,
        uint256 minEthAllocation,
        uint256 timestamp
    );
    event TopUp(address indexed user, uint256 balance, uint256 timestamp);

    // State variables
    address public reachToken;
    mapping(address => uint256) public credits;
    uint256 public creditPrice = 45 ether;

    /**
     * @dev Constructor that sets the initial Reach token address.
     * @param _reachToken The address of the Reach token.
     */
    constructor(address _reachToken) {
        if (_reachToken == address(0)) {
            revert InvalidTokenAddress();
        }
        reachToken = _reachToken;
    }

    // External functions
    /**
     * @dev Allows users to top up their credit balance.
     * @param _amount The amount of credits to add.
     */
    function topUp(uint256 _amount) external {
        uint256 price = _amount * creditPrice;
        if (!IERC20(reachToken).transferFrom(msg.sender, address(this), price))
            revert TopUpError();

        credits[msg.sender] += _amount;

        emit TopUp(msg.sender, _amount, block.timestamp);
    }

    /**
     * @dev Deploys a new affiliate distribution.
     */
    function deployAffiliateDistribution() external onlyOwner {
        ReachDistribution newDistribution = new ReachDistribution(
            reachToken,
            msg.sender
        );

        emit ReachAffiliateDistributionCreated(
            address(newDistribution),
            block.timestamp
        );
    }

    /**
     * @dev Withdraws all Reach tokens to the owner's address.
     */
    function withdrawTokens() external onlyOwner {
        uint256 balance = IERC20(reachToken).balanceOf(address(this));

        IERC20(reachToken).safeTransfer(owner(), balance);
    }

    /**
     * @dev Withdraws all Ether to the owner's address.
     */
    function withdrawETH() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
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

    /**
     * @dev Sets the Reach token address.
     * @param _token The address of the new Reach token.
     */
    function setToken(address _token) public onlyOwner {
        if (_token == address(0) || IERC20(_token).totalSupply() == 0) {
            revert InvalidTokenAddress();
        }
        reachToken = _token;
    }

    // Override functions
    /**
     * @dev Prevents the ownership from being renounced.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Can't renounce ownership");
    }
}
