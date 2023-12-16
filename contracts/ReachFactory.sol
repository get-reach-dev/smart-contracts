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
    event TopUp(
        address indexed user,
        uint256 balance,
        uint256 oldBalance,
        uint256 timestamp
    );

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

    // Modifiers
    modifier onlySigned(bytes calldata _signature, uint256 _data) {
        // Recreate the signed message from the provided credits and user's address
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _data));
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(
            messageHash
        );

        // Recover the signer from the provided signature
        address signer = ECDSA.recover(ethSignedMessageHash, _signature);
        if (signer != owner()) {
            revert InvalidSignature();
        }
        _;
    }

    // External functions
    /**
     * @dev Allows users to top up their credit balance.
     * @param _amount The amount of credits to add.
     * @param _signature The signature for verification.
     * @param _previousBalance The previous balance of the user.
     */
    function topUp(
        uint256 _amount,
        bytes calldata _signature,
        uint256 _previousBalance
    ) external onlySigned(_signature, _previousBalance) {
        uint256 price = _amount * creditPrice;
        if (!IERC20(reachToken).transferFrom(msg.sender, address(this), price))
            revert TopUpError();

        credits[msg.sender] = _amount + _previousBalance;

        emit TopUp(msg.sender, _amount, _previousBalance, block.timestamp);
    }

    /**
     * @dev Deploys a new affiliate distribution.
     */
    function deployAffiliateDistribution() external onlyOwner {
        ReachDistribution newDistribution = new ReachDistribution(
            reachToken,
            owner()
        );
        emit ReachAffiliateDistributionCreated(
            address(newDistribution),
            block.timestamp
        );
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

    // Internal functions
    /**
     * @dev Withdraws all Reach tokens to the owner's address.
     */
    function withdrawTokens() internal onlyOwner {
        uint256 balance = IERC20(reachToken).balanceOf(address(this));
        require(
            IERC20(reachToken).transfer(owner(), balance),
            "Transfer failed"
        );
    }

    /**
     * @dev Withdraws all Ether to the owner's address.
     */
    function withdrawETH() internal onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Override functions
    /**
     * @dev Prevents the ownership from being renounced.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Can't renounce ownership");
    }
}
