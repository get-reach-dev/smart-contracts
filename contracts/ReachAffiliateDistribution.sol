// SPDX-License-Identifier: unlicensed

pragma solidity 0.8.19;

import {ReachDistributionFactory} from "./ReachFactory.sol";
import {ReachDistribution} from "./ReachDistribution.sol";

/**
 * @title ReachDistribution
 * @dev This contract manages the distribution of Reach tokens and Ether based on Merkle proofs.
 */
contract ReachAffiliateDistribution is ReachDistribution {
    event AffiliateSwap(
        uint256 ethAmount,
        uint256 reachAmount,
        uint256 commissionAmount,
        uint256 timestamp
    );

    address public factory;

    /**
     * @dev Constructor for ReachDistribution contract.
     * @param _owner Address of the owner.
     */
    constructor(address _owner) {
        factory = msg.sender;
        _transferOwnership(_owner);
    }

    function swapEth(
        uint _ethToSwap,
        uint _commission,
        uint _outputAmount
    ) external onlyOwner {
        require(
            _ethToSwap + _commission <= address(this).balance,
            "Unsufficient eth balance"
        );
        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = reachToken;
        address mainDistribution = ReachDistributionFactory(factory)
            .mainDistribution();

        payable(mainDistribution).transfer(_commission);

        // make the swap
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: _ethToSwap
        }(_outputAmount, path, address(this), block.timestamp);

        emit AffiliateSwap(
            _ethToSwap,
            _outputAmount,
            _commission,
            block.timestamp
        );
    }
}
