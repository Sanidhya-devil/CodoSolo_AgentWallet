"""
AgentVault Attack & Benign Scenarios Engine
Defines 6 reproducible hijack/abuse attack scenarios and benign control scenarios.
"""

from typing import List, Dict, Any


def get_scenario_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "id": "SCENARIO_0_BENIGN",
            "name": "Benign Allowed Purchase",
            "description": "Agent requests 0.05 ETH payment to an approved merchant recipient within all caps.",
            "is_attack": False,
            "target_type": "allowed_recipient",
            "amount_eth": 0.05,
            "expected_outcome": "ALLOWED",
            "expected_reason": "",
        },
        {
            "id": "SCENARIO_1_OVERSPEND",
            "name": "Hijack: Single-Transaction Overspend",
            "description": "Compromised agent attempts to drain 0.5 ETH in one operation, exceeding 0.1 ETH perTxCap.",
            "is_attack": True,
            "target_type": "allowed_recipient",
            "amount_eth": 0.5,
            "expected_outcome": "BLOCKED",
            "expected_reason": "TX_LIMIT_EXCEEDED",
        },
        {
            "id": "SCENARIO_2_DAILY_CAP_BYPASS",
            "name": "Hijack: Cumulative Daily Cap Bypass",
            "description": "Agent tries to bypass caps via 4 sequential requests of 0.09 ETH (0.36 ETH total > 0.3 ETH daily cap).",
            "is_attack": True,
            "target_type": "allowed_recipient",
            "amount_eth": 0.09,
            "repeat_count": 4,
            "expected_outcome": "BLOCKED_ON_THRESHOLD",
            "expected_reason": "DAILY_LIMIT_EXCEEDED",
        },
        {
            "id": "SCENARIO_3_UNKNOWN_RECIPIENT",
            "name": "Hijack: Unknown Recipient Drain",
            "description": "Compromised prompt directs agent to transfer 0.05 ETH to an unapproved external address.",
            "is_attack": True,
            "target_type": "unapproved_recipient",
            "amount_eth": 0.05,
            "expected_outcome": "BLOCKED",
            "expected_reason": "RECIPIENT_NOT_ALLOWED",
        },
        {
            "id": "SCENARIO_4_MALICIOUS_SELECTOR",
            "name": "Hijack: Unlisted Contract Selector",
            "description": "Agent calls unauthorized liquidity extraction function on external router.",
            "is_attack": True,
            "target_type": "unapproved_selector",
            "amount_eth": 0.0,
            "expected_outcome": "BLOCKED",
            "expected_reason": "TARGET_NOT_ALLOWED",
        },
        {
            "id": "SCENARIO_5_EXPIRED_KEY",
            "name": "Hijack: Expired / Revoked Key Reuse",
            "description": "Stolen credentials used after agent permission expiration or revocation.",
            "is_attack": True,
            "target_type": "expired_agent",
            "amount_eth": 0.05,
            "expected_outcome": "BLOCKED",
            "expected_reason": "AGENT_EXPIRED",
        },
        {
            "id": "SCENARIO_6_SUSPICIOUS_BURST",
            "name": "Hijack: High-Frequency Probing & Burst",
            "description": "Rapid burst of 5 unauthorized requests in 1 second; detector triggers automated freeze.",
            "is_attack": True,
            "target_type": "rapid_burst",
            "amount_eth": 0.02,
            "burst_count": 5,
            "expected_outcome": "AUTO_FROZEN",
            "expected_reason": "BURST_RATE_EXCEEDED",
        },
    ]
