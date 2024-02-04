// SPDX-License-Identifier: unlicensed
pragma solidity 0.8.19;

import "./ReachAffiliateDistribution.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
error InvalidDistributionAddress();

/**
 * @title ReachDistributionFactory
 * @dev This contract allows for the management of Reach token distributions.
 */
contract ReachDistributionFactory is Ownable2Step {
    // Events
    event ReachAffiliateDistributionCreated(
        address indexed distribution,
        uint256 timestamp
    );

    // State variables
    address public mainDistribution;
    mapping(string => address) public affiliates;

    /**
     * @dev Constructor that sets the initial Reach token address.
     * @param _mainDistribution The address of the main distribution.
     */
    constructor(address _mainDistribution) {
        mainDistribution = _mainDistribution;
    }

    // External functions
    /**
     * @dev Deploys a new affiliate distribution.
     */
    function deployAffiliateDistribution(
        string memory _name
    ) external onlyOwner {
        require(affiliates[_name] == address(0), "Affiliate already exists");

        ReachAffiliateDistribution newDistribution = new ReachAffiliateDistribution(
                msg.sender
            );

        affiliates[_name] = address(newDistribution);
        emit ReachAffiliateDistributionCreated(
            address(newDistribution),
            block.timestamp
        );
    }

    /**
     * @dev Sets the main distribution address.
     * @param _mainDistribution The address of the new main distribution.
     */
    function setMainDistribution(address _mainDistribution) external onlyOwner {
        if (_mainDistribution == address(0)) {
            revert InvalidDistributionAddress();
        }
        mainDistribution = _mainDistribution;
    }

    // Override functions
    /**
     * @dev Prevents the ownership from being renounced.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert("Can't renounce ownership");
    }
}
