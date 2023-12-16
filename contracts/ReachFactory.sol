// SPDX-License-Identifier: unlicensed
pragma solidity >=0.8.19;

import "./ReachDistributionV2.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ReachDistributionFactory is Ownable {
    using SafeERC20 for IERC20;
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

    address public reachToken;
    mapping(address => uint256) public credits;
    ReachDistribution[] public deployedDistributions;
    uint256 public creditPrice = 45 ether;

    constructor(address _reachToken) Ownable() {
        require(_reachToken != address(0), "Invalid token address");
        require(IERC20(_reachToken).totalSupply() > 0, "Not a token");
        reachToken = _reachToken;
    }

    modifier onlySigned(bytes calldata _signature, uint256 _data) {
        // Recreate the signed message from the provided credits and user's address
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _data));
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(
            messageHash
        );

        // Recover the signer from the provided signature
        address signer = ECDSA.recover(ethSignedMessageHash, _signature);
        require(signer == owner(), "Invalid signature");
        _;
    }

    function topUp(
        uint256 _amount,
        bytes calldata _signature,
        uint256 _previousBalance
    ) external onlySigned(_signature, _previousBalance) {
        uint256 price = _amount * creditPrice;
        require(
            IERC20(reachToken).transferFrom(msg.sender, address(this), price),
            "Transfer failed"
        );

        credits[msg.sender] = _amount + _previousBalance;

        emit TopUp(msg.sender, _amount, _previousBalance, block.timestamp);
    }

    function setCreditPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Invalid price");
        creditPrice = _price;
    }

    function deployAffiliateDistribution() external onlyOwner {
        ReachDistribution newDistribution = new ReachDistribution(
            reachToken,
            owner()
        );
        deployedDistributions.push(newDistribution);

        emit ReachAffiliateDistributionCreated(
            address(newDistribution),
            block.timestamp
        );
    }

    function withdrawTokens() external onlyOwner {
        uint256 balance = IERC20(reachToken).balanceOf(address(this));
        require(
            IERC20(reachToken).transfer(owner(), balance),
            "Transfer failed"
        );
    }

    function withdrawETH() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function setToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        require(IERC20(_token).totalSupply() > 0, "Not a token");
        reachToken = _token;
    }
}
