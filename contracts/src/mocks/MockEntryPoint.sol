// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IEntryPoint.sol";

/**
 * @title MockEntryPoint
 * @notice Realistic Mock ERC-4337 EntryPoint for testing AgentVault and Paymaster interactions
 */
contract MockEntryPoint is IEntryPoint {
    mapping(address => uint256) public deposits;
    mapping(address => mapping(uint192 => uint256)) public nonces;

    event UserOperationHandled(address indexed sender, bool success, bytes returnData);

    receive() external payable {
        deposits[msg.sender] += msg.value;
    }

    function depositTo(address account) external payable override {
        deposits[account] += msg.value;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external override {
        require(deposits[msg.sender] >= withdrawAmount, "MockEntryPoint: insufficient deposit");
        deposits[msg.sender] -= withdrawAmount;
        (bool s, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(s, "MockEntryPoint: withdraw failed");
    }

    function getNonce(address sender, uint192 key) external view override returns (uint256) {
        return nonces[sender][key];
    }

    function getUserOpHash(UserOperation calldata userOp) public view override returns (bytes32) {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                keccak256(userOp.paymasterAndData),
                block.chainid,
                address(this)
            )
        );
    }

    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external override {
        for (uint256 i = 0; i < ops.length; i++) {
            _handleOp(ops[i], beneficiary);
        }
    }

    function _handleOp(UserOperation calldata op, address payable /* beneficiary */) internal {
        bytes32 opHash = getUserOpHash(op);

        // 1. Paymaster validation if present
        bytes memory paymasterContext = "";
        address paymaster = address(0);
        if (op.paymasterAndData.length >= 20) {
            paymaster = address(bytes20(op.paymasterAndData[:20]));
            (bytes memory ctx, uint256 pmValidation) = IPaymaster(paymaster).validatePaymasterUserOp(op, opHash, 100000);
            require(pmValidation == 0, "MockEntryPoint: paymaster validation failed");
            paymasterContext = ctx;
        }

        // 2. Account validation
        uint256 validationData = IAccount(op.sender).validateUserOp(op, opHash, 0);
        require(validationData == 0, "MockEntryPoint: account validation failed");

        // 3. Execution
        (bool success, bytes memory returnData) = op.sender.call{gas: op.callGasLimit}(op.callData);
        require(success, string(returnData));

        // 4. Paymaster postOp
        if (paymaster != address(0)) {
            IPaymaster(paymaster).postOp(0, paymasterContext, 50000);
        }

        // Increment nonce
        nonces[op.sender][0] += 1;

        emit UserOperationHandled(op.sender, success, returnData);
    }
}
