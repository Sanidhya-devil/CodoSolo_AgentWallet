// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC8004Reputation
 * @notice Reference implementation of the ERC-8004 "Trustless Agents" Reputation Registry.
 *         Maintains verifiable on-chain feedback, task completion metrics, and trust signals
 *         for autonomous AI agents.
 * @author Team CodoSolo (AgentVault for QDay Aevum Testnet)
 */
contract ERC8004Reputation is Ownable {
    struct FeedbackEntry {
        address client;
        uint8 score; // 1 - 100
        bytes32 taskHash;
        uint64 timestamp;
        string comments;
    }

    struct ReputationSummary {
        uint256 totalFeedback;
        uint256 cumulativeScore;
        uint256 disputeCount;
    }

    // agentId => ReputationSummary
    mapping(uint256 => ReputationSummary) public summaries;
    // agentId => FeedbackEntry[]
    mapping(uint256 => FeedbackEntry[]) private _feedbackHistory;

    event FeedbackGiven(
        uint256 indexed agentId,
        address indexed client,
        uint8 score,
        bytes32 indexed taskHash,
        string comments
    );
    event DisputeLogged(
        uint256 indexed agentId,
        address indexed client,
        bytes32 indexed taskHash,
        string reason
    );

    error InvalidScore(uint8 score);
    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Give verifiable feedback for an agent's task execution
     * @param agentId The ERC-8004 Agent ID
     * @param score Rating from 1 to 100
     * @param taskHash Cryptographic hash of the task request/response or transaction receipt
     * @param comments Description or remarks regarding execution quality
     */
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 taskHash,
        string calldata comments
    ) external {
        if (score == 0 || score > 100) revert InvalidScore(score);

        summaries[agentId].totalFeedback += 1;
        summaries[agentId].cumulativeScore += score;

        _feedbackHistory[agentId].push(FeedbackEntry({
            client: msg.sender,
            score: score,
            taskHash: taskHash,
            timestamp: uint64(block.timestamp),
            comments: comments
        }));

        emit FeedbackGiven(agentId, msg.sender, score, taskHash, comments);
    }

    /**
     * @notice Log a dispute or failed execution for an agent
     */
    function logDispute(
        uint256 agentId,
        bytes32 taskHash,
        string calldata reason
    ) external {
        summaries[agentId].disputeCount += 1;
        emit DisputeLogged(agentId, msg.sender, taskHash, reason);
    }

    /**
     * @notice Read summary metrics for an agent
     * @return totalFeedback Total feedback submissions
     * @return averageScore Average score (1-100), 0 if no feedback yet
     * @return disputeCount Total logged disputes
     */
    function getSummary(uint256 agentId)
        external
        view
        returns (
            uint256 totalFeedback,
            uint256 averageScore,
            uint256 disputeCount
        )
    {
        ReputationSummary memory summary = summaries[agentId];
        totalFeedback = summary.totalFeedback;
        disputeCount = summary.disputeCount;
        averageScore = totalFeedback > 0 ? summary.cumulativeScore / totalFeedback : 0;
    }

    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return _feedbackHistory[agentId].length;
    }

    function getFeedback(uint256 agentId, uint256 index) external view returns (FeedbackEntry memory) {
        return _feedbackHistory[agentId][index];
    }
}
