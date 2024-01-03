// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./MainDistribution.sol";

/**
 * @title ReachDistribution
 * @dev This contract manages the distribution of Reach tokens and Ether based on Merkle proofs.
 */
contract ReachAffiliateDistribution is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Events
    event Received(address indexed sender, uint256 amount);
    event MissionCreated(string missionId, uint256 amount);
    event RewardsClaimed(
        address indexed account,
        uint256 amount,
        uint256 indexed version,
        uint256 timestamp
    );
    event DistributionSet(bytes32 indexed merkleRoot, uint256 amount);
    event SwapPercentageSet(uint256 swapPercentage);

    mapping(address => uint256) public claims;
    uint256 public currentVersion;
    mapping(address => uint256) public lastClaimedVersion;
    address public mainDistribution;
    bool public paused;
    bytes32 public merkleRoot;
    uint256 public swapPercentage = 250;

    /**
     * @dev Constructor for ReachDistribution contract.
     * @param _owner Address of the owner.
     */
    constructor(address _owner, address _mainDistribution) {
        _transferOwnership(_owner);
        mainDistribution = _mainDistribution;
    }

    // External functions
    /**
     * @dev Toggles the pausing state of the contract.
     */
    function toggleClaiming() external onlyOwner {
        paused = !paused;
    }

    /**
     * @dev Sets the main distribution contract.
     * @param _mainDistribution The new main distribution contract.
     */
    function setMainDistribution(address _mainDistribution) external onlyOwner {
        mainDistribution = _mainDistribution;
    }

    /**
     * @dev Sets the swap percentage.
     * @param _swapPercentage The new swap percentage.
     */
    function setSwapPercentage(uint256 _swapPercentage) external onlyOwner {
        swapPercentage = _swapPercentage;
        emit SwapPercentageSet(_swapPercentage);
    }

    /*
     * @notice Creates a new mission
     * @param _missionId The ID of the new mission
     * @param _amount The amount allocated to the new mission
     */
    function createMission(
        string memory _missionId,
        uint256 _amount
    ) external payable {
        require(_amount > 0, "Amount must be greater than 0.");
        require(_amount == msg.value, "Incorrect amount sent.");

        uint256 amountToSwap = (_amount * swapPercentage) / 1000;
        ReachMainDistribution(payable(mainDistribution)).swapEth{
            value: amountToSwap
        }(amountToSwap, address(this));
        emit MissionCreated(_missionId, _amount);
    }

    /**
     * @dev Allows users to claim their rewards.
     * @param _merkleProof The merkle proof for the claim.
     * @param _amount The  amount to claim.
     */
    function claimRewards(
        bytes32[] calldata _merkleProof,
        uint256 _amount
    ) external nonReentrant {
        if (paused) revert ClaimingPaused();
        if (lastClaimedVersion[msg.sender] == currentVersion)
            revert AlreadyClaimed();
        if (!verifyProof(_merkleProof, _amount)) revert InvalidMerkleProof();

        lastClaimedVersion[msg.sender] = currentVersion;
        claims[msg.sender] += _amount;

        payable(msg.sender).transfer(_amount);

        emit RewardsClaimed(
            msg.sender,
            _amount,
            currentVersion,
            block.timestamp
        );
    }

    // Public functions
    /**
     * @dev Creates a new distribution of rewards.
     * @param _merkleRoot The merkle root of the distribution.
     * @param _amount The total ETH amount for the distribution.
     */
    function createDistribution(
        bytes32 _merkleRoot,
        uint256 _amount
    ) public onlyOwner {
        if (_merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (address(this).balance < _amount) revert UnsufficientEthBalance();

        currentVersion++;
        merkleRoot = _merkleRoot;
        emit DistributionSet(_merkleRoot, _amount);
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
     * @param _amount The ETH amount in the claim.
     * @return bool True if the proof is valid, false otherwise.
     */
    function verifyProof(
        bytes32[] calldata _merkleProof,
        uint256 _amount
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _amount));
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
