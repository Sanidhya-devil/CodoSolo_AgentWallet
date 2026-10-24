// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUniswapRouter
 * @notice Simulates a DeFi target (e.g. Uniswap Router) for testing target and selector allowlists
 */
contract MockUniswapRouter {
    event SwapExecuted(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address recipient, uint256 amount);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOutMin;
        emit SwapExecuted(to, path[0], path[path.length - 1], amountIn, amountOutMin);
        return amounts;
    }

    function unapprovedDangerousFunction(address recipient, uint256 amount) external {
        emit LiquidityAdded(recipient, amount);
    }
}
