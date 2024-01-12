// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "hardhat/console.sol";

contract ReachAirdrop is Ownable2Step {
    using SafeERC20 for IERC20;
    mapping(address => bool) claimed;
    uint256 public airdropAmount = 5_000_000 ether;
    uint256 public lostAirdrop;
    bytes32 internal merkleRoot;
    uint256 internal airdropStartTimestamp;
    uint256 internal constant airdropDurationInWeeks = 30;
    address internal reachToken;

    event AirdropClaimed(
        address indexed user,
        uint256 amount,
        uint256 weekNumber
    );

    constructor(bytes32 _merkleRoot, address _reachToken) {
        merkleRoot = _merkleRoot;
        airdropStartTimestamp = block.timestamp;
        reachToken = _reachToken;
    }

    // External functions
    /**
     * @dev Sets the Merkle root.
     * @param _merkleRoot The Merkle root.
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    /**
     * @dev Allows a user to claim their airdrop.
     * @param _merkleProof The Merkle proof.
     * @param _totalAmount The ETH amount in the claim.
     */
    function claim(
        bytes32[] calldata _merkleProof,
        uint256 _totalAmount
    ) external {
        require(!claimed[msg.sender], "Already claimed");
        require(
            verifyProof(_merkleProof, _totalAmount),
            "Invalid Merkle proof"
        );
        (uint256 amount, uint256 weeksSinceStart) = calculateAmount(
            _totalAmount
        );
        IERC20(reachToken).safeTransfer(msg.sender, amount);

        claimed[msg.sender] = true;
        lostAirdrop += _totalAmount - amount;

        emit AirdropClaimed(msg.sender, amount, weeksSinceStart);
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

    /**
     * @dev calculate the amount of tokens to be distributed for a user
     * @param _totalAmount the amount of tokens to be distributed
     * @return the amount of tokens to be distributed
     */
    function calculateAmount(
        uint256 _totalAmount
    ) public view returns (uint256, uint256) {
        uint256 weeksSinceStart = (block.timestamp - airdropStartTimestamp) /
            1 weeks +
            1;

        uint256 ratio = ((weeksSinceStart * 1 ether) / airdropDurationInWeeks);
        uint256 amount = (_totalAmount * ratio) / 1 ether;

        if (weeksSinceStart > airdropDurationInWeeks) {
            amount = _totalAmount;
            weeksSinceStart = airdropDurationInWeeks;
        }

        return (amount, weeksSinceStart);
    }

    //withdraw lost tokens
    function withdrawLostTokens() external onlyOwner {
        uint256 weekNumber = (block.timestamp - airdropStartTimestamp) /
            1 weeks +
            1;

        //allow ownerto withdraw all tokens after 34 weeks
        if (weekNumber > 34)
            IERC20(reachToken).safeTransfer(
                msg.sender,
                IERC20(reachToken).balanceOf(address(this))
            );
        else IERC20(reachToken).safeTransfer(msg.sender, lostAirdrop);
    }
}
