// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

error InvalidSignature();
error InvalidMerkleProof();
error ClaimingPaused();
error AlreadyClaimed();
error InvalidMerkleRoot();
error UnsufficientBalance();
error InvalidTokenAddress();
error LowRewardAmount();

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
        uint256 rewards,
        uint256 indexed version,
        uint256 timestamp
    );
    event DistributionSet(bytes32 indexed merkleRoot);
    event MissionCreated(string missionId, uint256 amount, string guildId);

    uint8 public currentVersion;
    uint256 public minMissionAmount = 100 ether;

    bool public claimingPaused;
    address public immutable reachToken =
        0x8B12BD54CA9B2311960057C8F3C88013e79316E3;
    bytes32 public merkleRoot;

    //mappings
    mapping(address => uint256) public lastClaimedVersion;

    // External functions
    /**
     * @dev Allows the owner to set the minimum amount for a mission.
     * @param _minMissionAmount The minimum amount for a mission.
     */
    function setMinMissionAmount(uint256 _minMissionAmount) external onlyOwner {
        minMissionAmount = _minMissionAmount;
    }

    /**
     * @dev Allows the owner to pause the claiming of rewards.
     */
    function pauseClaiming() external onlyOwner {
        claimingPaused = true;
    }

    /*
     * @notice Creates a new mission
     * @param _missionId The ID of the new mission
     * @param _amount The amount allocated to the new mission
     */
    function createMission(
        string memory _missionId,
        uint256 _amount,
        string memory _guildId
    ) external {
        if (_amount < minMissionAmount) revert LowRewardAmount();
        emit MissionCreated(_missionId, _amount, _guildId);
    }

    /**
     * @dev Allows users to claim their rewards.
     * @param _merkleProof The merkle proof for the claim.
     * @param _rewards The rewards to claim.
     */
    function claimRewards(
        bytes32[] calldata _merkleProof,
        uint256 _rewards
    ) external nonReentrant {
        if (claimingPaused) revert ClaimingPaused();
        if (lastClaimedVersion[msg.sender] == currentVersion)
            revert AlreadyClaimed();
        if (!verifyProof(_merkleProof, _rewards)) revert InvalidMerkleProof();
        if (_rewards > IERC20(reachToken).balanceOf(address(this)))
            revert UnsufficientBalance();

        require(_rewards > 0, "Rewards too low");

        lastClaimedVersion[msg.sender] = currentVersion;

        IERC20(reachToken).safeTransfer(msg.sender, _rewards);

        emit RewardsClaimed(
            msg.sender,
            _rewards,
            currentVersion,
            block.timestamp
        );
    }

    /**
     * @dev Creates a new distribution of rewards.
     * @param _merkleRoot The merkle root of the distribution.
     */
    function createDistribution(bytes32 _merkleRoot) external onlyOwner {
        require(claimingPaused, "Claiming not paused");
        if (_merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        currentVersion++;
        merkleRoot = _merkleRoot;
        claimingPaused = false;
        emit DistributionSet(_merkleRoot);
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
     * @param _rewards The rewards to claim.
     * @return bool True if the proof is valid, false otherwise.
     */
    function verifyProof(
        bytes32[] calldata _merkleProof,
        uint256 _rewards
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _rewards));
        return MerkleProof.verifyCalldata(_merkleProof, merkleRoot, leaf);
    }

    // Override functions
    /**
     * @dev Prevents renouncing ownership.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Can't renounce ownership");
    }
}
