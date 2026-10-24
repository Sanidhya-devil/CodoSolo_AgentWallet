"""
AgentVault AI Agent Client
Constructs, signs, and dispatches ERC-4337 UserOperations using restricted agent key.
"""

import time
from typing import Optional, Dict, Any
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3


class AgentClient:
    def __init__(self, private_key: str, vault_address: str, entry_point_address: str, chain_id: int = 31337):
        self.account = Account.from_key(private_key)
        self.address = self.account.address
        self.vault_address = Web3.to_checksum_address(vault_address)
        self.entry_point_address = Web3.to_checksum_address(entry_point_address)
        self.chain_id = chain_id

    def build_user_op(
        self,
        call_data: bytes,
        nonce: int = 0,
        call_gas_limit: int = 200000,
        verification_gas_limit: int = 150000,
        pre_verification_gas: int = 50000,
        max_fee_per_gas: int = 1000000000,
        max_priority_fee_per_gas: int = 1000000000,
        paymaster_and_data: bytes = b"",
    ) -> Dict[str, Any]:
        """Builds a raw UserOperation dictionary."""
        return {
            "sender": self.vault_address,
            "nonce": nonce,
            "initCode": b"",
            "callData": call_data,
            "callGasLimit": call_gas_limit,
            "verificationGasLimit": verification_gas_limit,
            "preVerificationGas": pre_verification_gas,
            "maxFeePerGas": max_fee_per_gas,
            "maxPriorityFeePerGas": max_priority_fee_per_gas,
            "paymasterAndData": paymaster_and_data,
            "signature": b"",
        }

    def compute_user_op_hash(self, user_op: Dict[str, Any]) -> bytes:
        """Computes the ERC-4337 userOpHash as defined in MockEntryPoint."""
        init_code_hash = Web3.keccak(user_op["initCode"])
        call_data_hash = Web3.keccak(user_op["callData"])
        paymaster_data_hash = Web3.keccak(user_op["paymasterAndData"])

        encoded = Web3.solidity_keccak(
            [
                "address",
                "uint256",
                "bytes32",
                "bytes32",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
                "uint256",
                "address",
            ],
            [
                user_op["sender"],
                user_op["nonce"],
                init_code_hash,
                call_data_hash,
                user_op["callGasLimit"],
                user_op["verificationGasLimit"],
                user_op["preVerificationGas"],
                user_op["maxFeePerGas"],
                user_op["maxPriorityFeePerGas"],
                paymaster_data_hash,
                self.chain_id,
                self.entry_point_address,
            ],
        )
        return encoded

    def sign_user_op(self, user_op: Dict[str, Any]) -> Dict[str, Any]:
        """Signs the userOpHash with the agent's private key (EIP-191 eth_sign)."""
        op_hash = self.compute_user_op_hash(user_op)
        message = encode_defunct(primitive=op_hash)
        signed_message = self.account.sign_message(message)
        
        user_op_copy = dict(user_op)
        user_op_copy["signature"] = signed_message.signature
        return user_op_copy
