// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC8004Identity
 * @notice Reference implementation of the ERC-8004 "Trustless Agents" Identity Registry.
 *         Mints ERC-721 AgentCards that point to an off-chain AgentCard JSON conforming to
 *         https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 * @author Team CodoSolo (AgentVault for QDay Aevum Testnet)
 */
contract ERC8004Identity is ERC721URIStorage, Ownable {
    uint256 private _nextAgentId;

    struct AgentInfo {
        address owner;
        string agentUri;
        bool active;
        uint64 registeredAt;
    }

    mapping(uint256 => AgentInfo) public agents;
    mapping(address => uint256[]) private _ownerAgents;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentUri);
    event AgentStatusUpdated(uint256 indexed agentId, bool active);
    event AgentUriUpdated(uint256 indexed agentId, string agentUri);

    error NotAgentOwner(uint256 agentId, address caller);
    error AgentNotFound(uint256 agentId);

    constructor() ERC721("ERC8004 Trustless Agent", "AGENT") Ownable(msg.sender) {
        _nextAgentId = 1;
    }

    /**
     * @notice Register a new autonomous AI agent by minting an ERC-8004 Agent Card NFT
     * @param agentUri URI (IPFS/HTTPS) linking to the agent's registration-v1 JSON metadata
     * @return agentId The unique on-chain identifier for the agent
     */
    function register(string memory agentUri) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentUri);

        agents[agentId] = AgentInfo({
            owner: msg.sender,
            agentUri: agentUri,
            active: true,
            registeredAt: uint64(block.timestamp)
        });

        _ownerAgents[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender, agentUri);
    }

    /**
     * @notice Update agent operational availability (active / paused)
     */
    function setAgentStatus(uint256 agentId, bool active) external {
        if (ownerOf(agentId) != msg.sender && owner() != msg.sender) {
            revert NotAgentOwner(agentId, msg.sender);
        }
        agents[agentId].active = active;
        emit AgentStatusUpdated(agentId, active);
    }

    /**
     * @notice Update agent metadata URI (e.g. updated capabilities, MCP tools, endpoints)
     */
    function setAgentUri(uint256 agentId, string memory newUri) external {
        if (ownerOf(agentId) != msg.sender && owner() != msg.sender) {
            revert NotAgentOwner(agentId, msg.sender);
        }
        _setTokenURI(agentId, newUri);
        agents[agentId].agentUri = newUri;
        emit AgentUriUpdated(agentId, newUri);
    }

    function getAgent(uint256 agentId) external view returns (AgentInfo memory) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return agents[agentId];
    }

    function getAgentsByOwner(address agentOwner) external view returns (uint256[] memory) {
        return _ownerAgents[agentOwner];
    }

    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
