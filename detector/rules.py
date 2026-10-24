"""
AgentVault Anomaly Detection Rules & Rate Monitoring
Evaluates transaction request stream for suspicious patterns and hijack signals.
"""

import time
from typing import List, Dict, Any, Tuple


class AnomalyDetector:
    def __init__(
        self,
        max_rejections_threshold: int = 3,
        burst_rate_limit: int = 4,
        burst_window_seconds: float = 5.0,
    ):
        self.max_rejections_threshold = max_rejections_threshold
        self.burst_rate_limit = burst_rate_limit
        self.burst_window_seconds = burst_window_seconds

        self.consecutive_rejections: int = 0
        self.recent_request_timestamps: List[float] = []
        self.history: List[Dict[str, Any]] = []

    def record_attempt(
        self,
        tx_hash: str,
        sender: str,
        dest: str,
        value_wei: int,
        success: bool,
        reason: str = "",
    ) -> Tuple[bool, str]:
        """
        Records a transaction attempt and checks if anomaly threshold is exceeded.
        Returns: (should_freeze, reason)
        """
        now = time.time()
        self.recent_request_timestamps.append(now)

        # Evict timestamps older than burst window
        self.recent_request_timestamps = [
            t for t in self.recent_request_timestamps if now - t <= self.burst_window_seconds
        ]

        if not success:
            self.consecutive_rejections += 1
        else:
            self.consecutive_rejections = 0

        event = {
            "timestamp": now,
            "tx_hash": tx_hash,
            "sender": sender,
            "dest": dest,
            "value_wei": value_wei,
            "success": success,
            "reason": reason,
        }
        self.history.append(event)

        # Rule 1: Consecutive policy violations / rejections
        if self.consecutive_rejections >= self.max_rejections_threshold:
            return (
                True,
                f"THRESHOLD_EXCEEDED: {self.consecutive_rejections} consecutive policy rejections detected (latest: {reason})",
            )

        # Rule 2: Rapid burst rate probing
        if len(self.recent_request_timestamps) >= self.burst_rate_limit:
            return (
                True,
                f"BURST_RATE_EXCEEDED: {len(self.recent_request_timestamps)} requests in {self.burst_window_seconds}s window",
            )

        return (False, "")

    def reset(self):
        self.consecutive_rejections = 0
        self.recent_request_timestamps.clear()
