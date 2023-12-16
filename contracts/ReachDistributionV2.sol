// SPDX-License-Identifier: unlicensed

pragma solidity ^0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ReachDistribution is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Received(address indexed sender, uint256 amount);
    event RewardsClaimed(
        address indexed account,
        uint256 ethAmount,
        uint256 reachAmount,
        uint256 indexed version,
        uint256 timestamp
    );
    event EthAllocationReserved(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );
    event DistributionSet(
        bytes32 indexed merkleRoot,
        uint256 ethAmount,
        uint256 reachAmount
    );

    struct Claims {
        uint256 eth;
        uint256 reach;
    }

    mapping(address => Claims) public claims;
    uint256 public currentVersion;
    mapping(address => uint256) public lastClaimedVersion;
    address public reachToken;
    bool public paused;
    bytes32 public merkleRoot;
    uint256 public minEthAllocation = 0.015 ether;
    mapping(address => uint256) public ethAllocations;

    constructor(address _reachToken, address _owner) {
        reachToken = _reachToken;
        transferOwnership(_owner);
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

    /*
     * @notice Pauses the contract
     */
    function toggleClaiming() external onlyOwner {
        paused = !paused;
    }

    function verifyProof(
        bytes32[] calldata _merkleProof,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) internal view returns (bool) {
        bytes32 _leaf = keccak256(
            abi.encodePacked(msg.sender, _ethAmount, _reachAmount)
        );

        return MerkleProof.verify(_merkleProof, merkleRoot, _leaf);
    }

    function reserveEthAllocation(
        bytes calldata _signature,
        uint256 _previousBalance
    ) external payable onlySigned(_signature, _previousBalance) {
        require(msg.value >= minEthAllocation, "Must send ETH");
        ethAllocations[msg.sender] = msg.value + _previousBalance;

        emit EthAllocationReserved(msg.sender, msg.value, block.timestamp);
    }

    /*
     * @notice Allows users to claim rewards
     * @param _amount The amount to be claimed
     * @param _merkleProof The merkle proof required for claiming
     */
    function claimRewards(
        bytes32[] calldata _merkleProof,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) external nonReentrant {
        require(!paused, "Claiming is paused.");
        // Ensure the user is claiming for the current version
        require(
            lastClaimedVersion[msg.sender] < currentVersion,
            "Already claimed for this version."
        );

        require(
            verifyProof(_merkleProof, _ethAmount, _reachAmount),
            "Invalid Merkle Proof."
        );

        lastClaimedVersion[msg.sender] = currentVersion;

        if (_ethAmount > 0) {
            claims[msg.sender].eth += _ethAmount;
            (bool success, ) = payable(msg.sender).call{value: _ethAmount}("");
            require(success, "Transfer failed.");
        }

        if (_reachAmount > 0) {
            claims[msg.sender].reach += _reachAmount;
            IERC20(reachToken).safeTransfer(msg.sender, _reachAmount);
        }

        emit RewardsClaimed(
            msg.sender,
            _ethAmount,
            _reachAmount,
            currentVersion,
            block.timestamp
        );
    }

    /*
     * @notice Creates a new distribution
     * @param _merkleRoot The merkle root for the new distribution
     * @param _amount The total amount for the new distribution
     */
    function createDistribution(
        bytes32 _merkleRoot,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) external onlyOwner {
        require(_merkleRoot != bytes32(0), "Invalid merkle root.");
        require(
            address(this).balance >= _ethAmount,
            "Insufficient ETH balance."
        );
        require(
            IERC20(reachToken).balanceOf(address(this)) >= _reachAmount,
            "Insufficient REACH balance."
        );
        currentVersion++;
        merkleRoot = _merkleRoot;

        emit DistributionSet(_merkleRoot, _ethAmount, _reachAmount);
    }

    /*
     * @notice Sets the address of the ERC20 token for distributions
     * @param _token The address of the ERC20 token
     */
    function setReachAddress(address _token) external onlyOwner {
        //ensure that the address supports ERC20 interface
        require(
            IERC20(_token).totalSupply() > 0,
            "Invalid ERC20 token address."
        );
        reachToken = _token;
    }

    // Fallback function to receive Ether
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function setMinEthAllocation(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Invalid amount");
        minEthAllocation = _amount;
    }
}
