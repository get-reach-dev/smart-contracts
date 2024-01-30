// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReachDistributionFactory} from "./ReachFactory.sol";

import "./interfaces/IDex.sol";

error InvalidSignature();
error InvalidMerkleProof();
error ClaimingPaused();
error UnsufficientEthAllocation();
error AlreadyClaimed();
error InvalidMerkleRoot();
error UnsufficientEthBalance();
error UnsufficientReachBalance();
error InvalidTokenAddress();
error InvalidPrice();

/**
 * @title ReachDistribution
 * @dev This contract manages the distribution of Reach tokens and Ether based on Merkle proofs.
 */
contract ReachAffiliateDistribution is Ownable2Step, ReentrancyGuard {
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
    event DistributionSet(bytes32 indexed merkleRoot);
    event MissionCreated(string missionId, uint256 amount);
    event EthSwapped(
        uint256 ethAmount,
        uint256 reachAmount,
        uint256 ethCommission,
        uint256 timestamp
    );

    IRouter public router = IRouter(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

    uint256 public currentVersion;
    mapping(address => uint256) public lastClaimedVersion;
    address immutable reachToken = 0x8B12BD54CA9B2311960057C8F3C88013e79316E3;
    address public factory;
    bytes32 public merkleRoot;
    uint256 public minMissionAmount = 0.05 ether;

    /**
     * @dev Constructor for ReachDistribution contract.
     * @param _owner Address of the owner.
     */
    constructor(address _owner) {
        factory = msg.sender;
        _transferOwnership(_owner);
    }

    // External functions
    /**
     * @dev Allows the owner to set the minimum amount for a mission.
     * @param _minMissionAmount The minimum amount for a mission.
     */
    function setMinMissionAmount(uint256 _minMissionAmount) external onlyOwner {
        minMissionAmount = _minMissionAmount;
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
        if (msg.value < _amount) revert UnsufficientEthAllocation();
        emit MissionCreated(_missionId, _amount);
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
        if (lastClaimedVersion[msg.sender] == currentVersion)
            revert AlreadyClaimed();
        if (!verifyProof(_merkleProof, _ethAmount, _reachAmount))
            revert InvalidMerkleProof();

        lastClaimedVersion[msg.sender] = currentVersion;

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

    // Public functions
    /**
     * @dev Creates a new distribution of rewards.
     * @param _merkleRoot The merkle root of the distribution.
     */
    function createDistribution(bytes32 _merkleRoot) external onlyOwner {
        if (_merkleRoot == bytes32(0)) revert InvalidMerkleRoot();

        currentVersion++;
        merkleRoot = _merkleRoot;
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
        return MerkleProof.verifyCalldata(_merkleProof, merkleRoot, leaf);
    }

    // Override functions
    function swapEth(
        uint _ethAmount,
        uint _outputAmount
    ) external onlyOwner returns (uint256 outputAmount) {
        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = reachToken;
        uint256 balanceBefore = IERC20(reachToken).balanceOf(address(this));
        address mainDistribution = ReachDistributionFactory(factory)
            .mainDistribution();
        uint256 commission = ReachDistributionFactory(factory).commission();
        uint256 commissionAmount = (_ethAmount * commission) / 100;

        // transfer the eth to the main distribution
        payable(mainDistribution).transfer(commissionAmount);

        // make the swap
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: _ethAmount
        }(_outputAmount, path, address(this), block.timestamp);

        uint256 balanceAfter = IERC20(reachToken).balanceOf(address(this));
        outputAmount = balanceAfter - balanceBefore;

        emit EthSwapped(
            _ethAmount,
            outputAmount,
            commissionAmount,
            block.timestamp
        );
    }
}
