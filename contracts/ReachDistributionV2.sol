// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

error InvalidSignature();
error InvalidMerkleProof();
error ClaimingPaused();
error UnsufficientEthAllocation();
error AlreadyClaimed();
error InvalidMerkleRoot();
error UnsufficientEthBalance();
error UnsufficientReachBalance();
error InvalidTokenAddress();

/**
 * @title ReachDistribution
 * @dev This contract manages the distribution of Reach tokens and Ether based on Merkle proofs.
 */
contract ReachDistribution is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Events
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

    // State variables
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

    /**
     * @dev Constructor for ReachDistribution contract.
     * @param _reachToken Address of the Reach token.
     * @param _owner Address of the owner.
     */
    constructor(address _reachToken, address _owner) {
        reachToken = _reachToken;
        _transferOwnership(_owner);
    }

    // External functions
    /**
     * @dev Toggles the pausing state of the contract.
     */
    function toggleClaiming() external onlyOwner {
        paused = !paused;
    }

    /**
     * @dev Reserves an allocation for ETH for the sender.
     */
    function reserveEthAllocation() external payable {
        if (msg.value < minEthAllocation) revert UnsufficientEthAllocation();
        ethAllocations[msg.sender] += msg.value;
        emit EthAllocationReserved(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @dev Allows users to claim their rewards.
     * @param _merkleProof The merkle proof for the claim.
     * @param _ethAmount The ETH amount to claim.
     * @param _reachAmount The Reach token amount to claim.
     */
    function claimRewards(
        bytes32[] calldata _merkleProof,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) external nonReentrant {
        if (paused) revert ClaimingPaused();
        if (lastClaimedVersion[msg.sender] == currentVersion)
            revert AlreadyClaimed();
        if (!verifyProof(_merkleProof, _ethAmount, _reachAmount))
            revert InvalidMerkleProof();

        lastClaimedVersion[msg.sender] = currentVersion;
        claims[msg.sender] = Claims({eth: _ethAmount, reach: _reachAmount});

        if (_ethAmount > 0) payable(msg.sender).transfer(_ethAmount);
        if (_reachAmount > 0)
            IERC20(reachToken).safeTransfer(msg.sender, _reachAmount);

        emit RewardsClaimed(
            msg.sender,
            _ethAmount,
            _reachAmount,
            currentVersion,
            block.timestamp
        );
    }

    /**
     * @dev Sets the minimum ETH allocation.
     * @param _amount The new minimum ETH allocation amount.
     */
    function setMinEthAllocation(uint256 _amount) external onlyOwner {
        if (_amount == 0) revert UnsufficientEthAllocation();
        minEthAllocation = _amount;
    }

    // Public functions
    /**
     * @dev Creates a new distribution of rewards.
     * @param _merkleRoot The merkle root of the distribution.
     * @param _ethAmount The total ETH amount for the distribution.
     * @param _reachAmount The total Reach token amount for the distribution.
     */
    function createDistribution(
        bytes32 _merkleRoot,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) public onlyOwner {
        if (_merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (address(this).balance < _ethAmount) revert UnsufficientEthBalance();
        if (IERC20(reachToken).balanceOf(address(this)) < _reachAmount)
            revert UnsufficientReachBalance();

        currentVersion++;
        merkleRoot = _merkleRoot;
        emit DistributionSet(_merkleRoot, _ethAmount, _reachAmount);
    }

    /**
     * @dev Sets the Reach token address.
     * @param _token The new Reach token address.
     */
    function setReachAddress(address _token) public onlyOwner {
        if (_token == address(0) || IERC20(_token).totalSupply() == 0) {
            revert InvalidTokenAddress();
        }
        reachToken = _token;
    }

    // Fallback function
    /**
     * @dev Fallback function to receive Ether.
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // Internal functions
    /**
     * @dev Verifies the Merkle proof for a claim.
     * @param _merkleProof The Merkle proof.
     * @param _ethAmount The ETH amount in the claim.
     * @param _reachAmount The Reach token amount in the claim.
     * @return bool True if the proof is valid, false otherwise.
     */
    function verifyProof(
        bytes32[] calldata _merkleProof,
        uint256 _ethAmount,
        uint256 _reachAmount
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked(msg.sender, _ethAmount, _reachAmount)
        );
        return MerkleProof.verify(_merkleProof, merkleRoot, leaf);
    }

    // Override functions
    /**
     * @dev Prevents renouncing ownership.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Can't renounce ownership");
    }
}
