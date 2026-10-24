"""
AgentVault Detector Service
Monitors events, analyzes suspicious behavior, and executes auto-freeze transactions.
"""

from typing import Optional, Dict, Any, Tuple
from web3 import Web3
from eth_account import Account
from .rules import AnomalyDetector


class DetectorService:
    def __init__(
        self,
        web3_provider_url: Optional[str] = None,
        detector_private_key: Optional[str] = None,
        vault_address: Optional[str] = None,
        vault_abi: Optional[list] = None,
    ):
        self.detector = AnomalyDetector()
        self.w3 = Web3(Web3.HTTPProvider(web3_provider_url)) if web3_provider_url else None
        self.account = Account.from_key(detector_private_key) if detector_private_key else None
        self.vault_address = Web3.to_checksum_address(vault_address) if vault_address else None
        self.vault_contract = (
            self.w3.eth.contract(address=self.vault_address, abi=vault_abi)
            if self.w3 and self.vault_address and vault_abi
            else None
        )
        self.metrics = {
            "total_attempts": 0,
            "blocked_operations": 0,
            "suspicious_events": 0,
            "freeze_triggers": 0,
            "false_freezes": 0,
        }

    def process_transaction(
        self,
        sender: str,
        dest: str,
        value_wei: int,
        success: bool,
        reason: str = "",
        is_labeled_attack: bool = False,
    ) -> Dict[str, Any]:
        """
        Processes a transaction event, checks anomaly thresholds, and triggers freeze if warranted.
        """
        self.metrics["total_attempts"] += 1
        if not success:
            self.metrics["blocked_operations"] += 1

        should_freeze, freeze_reason = self.detector.record_attempt(
            tx_hash="",
            sender=sender,
            dest=dest,
            value_wei=value_wei,
            success=success,
            reason=reason,
        )

        triggered = False
        tx_receipt = None

        if should_freeze:
            self.metrics["freeze_triggers"] += 1
            triggered = True
            if not is_labeled_attack:
                self.metrics["false_freezes"] += 1

            # Dispatch on-chain freeze transaction if connected to live RPC
            if self.vault_contract and self.account and self.w3:
                tx_receipt = self._dispatch_freeze_on_chain(freeze_reason)

        return {
            "should_freeze": should_freeze,
            "freeze_reason": freeze_reason,
            "freeze_triggered": triggered,
            "tx_receipt": tx_receipt,
            "metrics": dict(self.metrics),
        }

    def _dispatch_freeze_on_chain(self, reason: str) -> str:
        """Sends freezeAgent transaction directly to AgentVault contract."""
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        tx = self.vault_contract.functions.freezeAgent(reason).build_transaction({
            "from": self.account.address,
            "nonce": nonce,
            "gas": 150000,
            "maxFeePerGas": self.w3.eth.gas_price,
            "maxPriorityFeePerGas": self.w3.to_wei(1, "gwei"),
            "chainId": self.w3.eth.chain_id,
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        return receipt.transactionHash.hex()
