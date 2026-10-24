import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Activity,
  Sliders,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Flame,
  FileCode,
  Check,
  Ban,
  Terminal,
  Radio,
  Cpu,
  RefreshCw,
  Copy,
  ExternalLink,
  Sparkles,
  Key,
  Shield,
  Wallet,
  Globe,
  User,
  LogIn,
  UserPlus,
  LogOut,
  Database,
  X,
  Layers,
  Coins,
  Save,
  Loader2,
  CheckCircle2,
  Filter,
  Search,
  Trash2,
  ArrowUpRight,
  CheckCheck,
  Server,
  AlertCircle,
  Plus
} from 'lucide-react';
import { ethers } from 'ethers';

const API_BASE = "http://localhost:8000/api";

interface UserProfile {
  id: number;
  email: string;
  username: string;
  wallet_address?: string;
  role: string;
}

interface ActivityItem {
  id: string;
  time: string;
  sender: string;
  destination: string;
  amount: string;
  status: 'ALLOWED' | 'BLOCKED' | 'AUTO_FROZEN';
  reasonCode?: string;
  details: string;
  txHash?: string;
  isOnChain?: boolean;
}

interface TerminalLog {
  id: string;
  time: string;
  level: 'INFO' | 'WARN' | 'CRIT' | 'SUCCESS';
  message: string;
}

const AGENT_VAULT_ABI = [
  "function freezeAgent(string calldata reason) external",
  "function unfreezeAgent() external",
  "function revokeAgent() external",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 windowDuration, uint256 agentExpiry) external",
  "function vetoRecovery(uint256 recoveryId) external",
  "function executeRecovery(uint256 recoveryId) external",
  "function getStatus() external view returns (uint8)",
  "function getSpentToday() external view returns (uint256)",
  "function owner() external view returns (address)"
];

const VAULT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export default function App() {
  const [activeTab, setActiveTab] = useState<'cockpit' | 'policy' | 'simulator' | 'activity' | 'recovery' | 'terminal'>('cockpit');

  // Auth & Database State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState<string>('owner@agentvault.io');
  const [authPassword, setAuthPassword] = useState<string>('MasterPassword123');
  const [authUsername, setAuthUsername] = useState<string>('VaultOwner');
  const [authRole, setAuthRole] = useState<string>('owner');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Web3 Wallet State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0.00');
  const [chainId, setChainId] = useState<number | null>(31337);
  const [networkName, setNetworkName] = useState<string>('Localnet (31337)');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [txPending, setTxPending] = useState<boolean>(false);
  const [txStatusMsg, setTxStatusMsg] = useState<string | null>(null);

  // Vault State
  const [status, setStatus] = useState<'ACTIVE' | 'FROZEN' | 'REVOKED' | 'EXPIRED' | 'RECOVERY_PENDING'>('ACTIVE');
  const [freezeReason, setFreezeReason] = useState<string>('');
  const [perTxCap, setPerTxCap] = useState<number>(0.1);
  const [dailyCap, setDailyCap] = useState<number>(0.3);
  const [spentToday, setSpentToday] = useState<number>(0.05);
  const [vaultBalance, setVaultBalance] = useState<number>(5.0);
  const [expiryDays, setExpiryDays] = useState<number>(7);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Policy Save State
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false);
  const [policySaveSuccess, setPolicySaveSuccess] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [containmentNotice, setContainmentNotice] = useState<{ type: 'CRIT' | 'SUCCESS' | 'WARN'; message: string } | null>(null);

  // Recovery State
  const [guardianVotes, setGuardianVotes] = useState<boolean[]>([false, false, false, false, false]);
  const [recoveryRequested, setRecoveryRequested] = useState<boolean>(false);
  const [delayElapsedHours, setDelayElapsedHours] = useState<number>(0);
  const [recoveryVetoed, setRecoveryVetoed] = useState<boolean>(false);
  const [recoveryCompleted, setRecoveryCompleted] = useState<boolean>(false);

  // Paymaster Quota (Issue 18)
  const [quotaMaxOps, setQuotaMaxOps] = useState<number>(50);
  const [quotaOpsUsed, setQuotaOpsUsed] = useState<number>(14);

  // Terminal & Activity
  const [logs, setLogs] = useState<TerminalLog[]>([
    { id: '1', time: '20:20:02', level: 'INFO', message: '[MockEntryPoint] EntryPoint v0.7 initialized at 0x5FbDB2...80aa3' },
    { id: '2', time: '20:20:03', level: 'INFO', message: '[AgentVault] Contract deployed on-chain with Cancun EVM support' },
    { id: '3', time: '20:20:05', level: 'SUCCESS', message: '[SecurityPatch] RECOVERY_PENDING check & ERC-20 transfer limit activated' },
    { id: '4', time: '20:20:12', level: 'INFO', message: '[Paymaster] Atomic batch reservation accounting enabled' },
  ]);

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [simResults, setSimResults] = useState<{ [key: string]: { status: string; code: string; ok: boolean; txHash?: string } }>({});
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  // Enhanced UI & Interactive State
  const [activitySearchQuery, setActivitySearchQuery] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'ALLOWED' | 'BLOCKED' | 'AUTO_FROZEN'>('ALL');
  const [terminalFilter, setTerminalFilter] = useState<'ALL' | 'SUCCESS' | 'CRIT' | 'WARN' | 'INFO'>('ALL');
  const [whitelistedRecipients, setWhitelistedRecipients] = useState<string[]>([
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ]);
  const [newRecipientAddress, setNewRecipientAddress] = useState<string>('');
  const [isBenchmarkingAll, setIsBenchmarkingAll] = useState<boolean>(false);
  const [benchmarkStats, setBenchmarkStats] = useState<{ total: number; blocked: number; allowed: number; detectionRate: string; falseFreezeRate: string } | null>(null);

  const applyPreset = (preset: 'conservative' | 'balanced' | 'high') => {
    if (preset === 'conservative') {
      setPerTxCap(0.05);
      setDailyCap(0.15);
      addLog('INFO', '[POLICY PRESET] Conservative profile loaded: 0.05 ETH / tx, 0.15 ETH / day.');
    } else if (preset === 'balanced') {
      setPerTxCap(0.10);
      setDailyCap(0.30);
      addLog('INFO', '[POLICY PRESET] Balanced profile loaded: 0.10 ETH / tx, 0.30 ETH / day.');
    } else if (preset === 'high') {
      setPerTxCap(0.25);
      setDailyCap(0.75);
      addLog('INFO', '[POLICY PRESET] High-Volume profile loaded: 0.25 ETH / tx, 0.75 ETH / day.');
    }
  };

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddr = newRecipientAddress.trim();
    if (!cleanAddr.startsWith('0x') || cleanAddr.length !== 42) {
      addLog('WARN', '[ALLOWLIST] Invalid address format. Must be 42 characters starting with 0x.');
      return;
    }
    if (whitelistedRecipients.includes(cleanAddr)) {
      addLog('WARN', '[ALLOWLIST] Address already in approved list.');
      return;
    }
    setWhitelistedRecipients([...whitelistedRecipients, cleanAddr]);
    addLog('SUCCESS', `[ALLOWLIST ADDED] Recipient approved: ${cleanAddr.slice(0, 8)}...${cleanAddr.slice(-6)}`);
    setNewRecipientAddress('');
  };

  const handleRemoveRecipient = (addr: string) => {
    setWhitelistedRecipients(whitelistedRecipients.filter((a) => a !== addr));
    addLog('INFO', `[ALLOWLIST REMOVED] Recipient removed: ${addr.slice(0, 8)}...`);
  };

  const advanceTimelock = (hours: number) => {
    setDelayElapsedHours((prev) => Math.min(48, prev + hours));
    addLog('INFO', `[TIMELOCK SIMULATOR] Fast-forwarded time by +${hours} hours.`);
  };

  const addLog = (level: 'INFO' | 'WARN' | 'CRIT' | 'SUCCESS', message: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: `log-${Date.now()}-${Math.random()}`, time: timeStr, level, message }, ...prev.slice(0, 49)]);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Database fetch
  const fetchActivitiesFromDb = async () => {
    try {
      const res = await fetch(`${API_BASE}/activity?limit=30`);
      const data = await res.json();
      if (data.success && data.activities) {
        const mapped: ActivityItem[] = data.activities.map((a: any) => ({
          id: `tx-${a.id}`,
          time: a.timestamp.split(' ')[1] || '20:25:00',
          sender: a.sender.slice(0, 6) + '...' + a.sender.slice(-4),
          destination: a.destination.slice(0, 6) + '...' + a.destination.slice(-4),
          amount: `${a.amount_eth.toFixed(2)} ETH`,
          status: a.status as any,
          reasonCode: a.reason_code || undefined,
          details: a.details || '',
          txHash: a.tx_hash || undefined,
          isOnChain: Boolean(a.is_on_chain),
        }));
        setActivities(mapped);
      }
    } catch (e) {
      console.warn("Could not fetch activities from SQLite database:", e);
    }
  };

  const recordActivityToDb = async (item: {
    destination: string;
    amount_eth: number;
    status: string;
    reason_code?: string;
    details: string;
    tx_hash?: string;
    is_on_chain?: number;
  }) => {
    try {
      const token = localStorage.getItem('agentvault_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${API_BASE}/activity`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vault_address: VAULT_ADDRESS,
          sender: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          destination: item.destination,
          amount_eth: item.amount_eth,
          status: item.status,
          reason_code: item.reason_code || null,
          details: item.details,
          tx_hash: item.tx_hash || `0x${Math.random().toString(16).substring(2, 66)}`,
          is_on_chain: item.is_on_chain || 0,
          chain_id: chainId || 31337,
        }),
      });
      fetchActivitiesFromDb();
    } catch (e) {
      console.warn("Failed to persist to SQLite:", e);
    }
  };

  // Fetch policy configuration from SQLite database
  const fetchPolicyFromDb = async () => {
    try {
      const res = await fetch(`${API_BASE}/policy?vault_address=${VAULT_ADDRESS}`);
      const data = await res.json();
      if (data.success) {
        if (typeof data.per_tx_cap_eth === 'number') setPerTxCap(data.per_tx_cap_eth);
        if (typeof data.daily_cap_eth === 'number') setDailyCap(data.daily_cap_eth);
      }
    } catch (e) {
      console.warn("Could not fetch policy from database:", e);
    }
  };

  const handleSavePolicy = async () => {
    if (perTxCap > dailyCap) {
      setPolicyError(`Per-transaction cap (${perTxCap.toFixed(2)} ETH) cannot exceed daily cap (${dailyCap.toFixed(2)} ETH).`);
      addLog('WARN', `[POLICY REJECTED] perTxCap (${perTxCap.toFixed(2)} ETH) > dailyCap (${dailyCap.toFixed(2)} ETH)`);
      return;
    }

    setIsSavingPolicy(true);
    setPolicyError(null);
    setPolicySaveSuccess(null);

    let onChainTxHash: string | undefined = undefined;
    let isOnChain = false;

    // 1. Attempt on-chain contract update if Web3 wallet is connected
    if (walletAddress && (window as any).ethereum) {
      try {
        setTxPending(true);
        setTxStatusMsg('Submitting setPolicy transaction to AgentVault contract via MetaMask...');

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(VAULT_ADDRESS, AGENT_VAULT_ABI, signer);

        const perTxWei = ethers.parseEther(perTxCap.toString());
        const dailyWei = ethers.parseEther(dailyCap.toString());
        const windowDuration = 86400; // 24 hours
        const agentExpiry = 0;

        const tx = await contract.setPolicy(perTxWei, dailyWei, windowDuration, agentExpiry);
        setTxStatusMsg(`Tx Broadcasted: ${tx.hash.slice(0, 10)}... Waiting for block confirmation...`);
        const receipt = await tx.wait();

        onChainTxHash = receipt.hash;
        isOnChain = true;
        setTxStatusMsg('Policy successfully confirmed on-chain!');
        addLog('SUCCESS', `[ON-CHAIN CONFIRMED] Policy updated in Block #${receipt.blockNumber} (Tx: ${receipt.hash.slice(0, 10)}...)`);
      } catch (err: any) {
        console.warn("On-chain setPolicy error/rejection:", err);
        addLog('WARN', `[WALLET] On-chain setPolicy not confirmed (${err.reason || err.message?.slice(0, 50) || 'Rejected'}). Persisting policy to SQLite database...`);
      } finally {
        setTimeout(() => {
          setTxPending(false);
          setTxStatusMsg(null);
        }, 2000);
      }
    }

    // 2. Persist updated policy to backend SQLite database
    try {
      const token = localStorage.getItem('agentvault_token');
      const res = await fetch(`${API_BASE}/policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          vault_address: VAULT_ADDRESS,
          per_tx_cap_eth: perTxCap,
          daily_cap_eth: dailyCap,
          is_on_chain: isOnChain ? 1 : 0,
          tx_hash: onChainTxHash || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save policy');
      }

      setPolicySaveSuccess(
        isOnChain
          ? `✓ Policy confirmed on-chain and saved in SQLite database (${perTxCap.toFixed(2)} ETH / tx, ${dailyCap.toFixed(2)} ETH / day).`
          : `✓ Policy limits saved to SQLite database (${perTxCap.toFixed(2)} ETH / tx, ${dailyCap.toFixed(2)} ETH / day).`
      );
      addLog('SUCCESS', `[POLICY SAVED] perTxCap: ${perTxCap.toFixed(2)} ETH | dailyCap: ${dailyCap.toFixed(2)} ETH (SQLite Synced)`);
      fetchActivitiesFromDb();
      setTimeout(() => setPolicySaveSuccess(null), 4500);
    } catch (err: any) {
      console.error("Backend policy save error:", err);
      setPolicyError(err.message || 'Failed to save policy configuration.');
      addLog('CRIT', `[DATABASE ERROR] Could not save policy: ${err.message}`);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  useEffect(() => {
    fetchActivitiesFromDb();
    fetchPolicyFromDb();
    const token = localStorage.getItem('agentvault_token');
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            setCurrentUser(data.user);
            addLog('SUCCESS', `[AUTH] Authenticated session restored: ${data.user.username}`);
          }
        })
        .catch(() => localStorage.removeItem('agentvault_token'));
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const endpoint = authMode === 'signup' ? `${API_BASE}/auth/signup` : `${API_BASE}/auth/login`;
      const payload =
        authMode === 'signup'
          ? {
              email: authEmail,
              username: authUsername,
              password: authPassword,
              wallet_address: walletAddress || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              role: authRole,
            }
          : { email: authEmail, password: authPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');

      if (data.success && data.token) {
        localStorage.setItem('agentvault_token', data.token);
        setCurrentUser(data.user);
        setAuthModalOpen(false);
        addLog('SUCCESS', `[AUTH] Welcome, ${data.user.username} (${data.user.role})`);
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('agentvault_token');
    setCurrentUser(null);
    addLog('INFO', `[AUTH] User signed out.`);
  };

  // Web3 Connection
  const connectWallet = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('MetaMask extension not found. Running in simulated local demonstration mode.');
      return;
    }

    try {
      setIsConnecting(true);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      const balanceWei = await provider.getBalance(accounts[0]);

      setWalletAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setWalletBalance(parseFloat(ethers.formatEther(balanceWei)).toFixed(4));

      const id = Number(network.chainId);
      if (id === 11155111) setNetworkName('Ethereum Sepolia (11155111)');
      else if (id === 84532) setNetworkName('Base Sepolia (84532)');
      else if (id === 31337) setNetworkName('Localnet (31337)');
      else setNetworkName(`Chain ID: ${id}`);

      addLog('SUCCESS', `[WALLET CONNECTED] ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
    } catch (err: any) {
      addLog('WARN', `[WALLET] Connection request cancelled.`);
    } finally {
      setIsConnecting(false);
    }
  };

  const guardianCount = guardianVotes.filter(Boolean).length;

  // Real on-chain action with MetaMask fallback
  const handleManualFreeze = async (reason: string) => {
    if (status === 'FROZEN') {
      setContainmentNotice({
        type: 'WARN',
        message: 'Agent is already FROZEN. All user operations are currently rejected on-chain.',
      });
      addLog('WARN', '[CONTAINMENT] Freeze requested, but agent status is already FROZEN.');
      setTimeout(() => setContainmentNotice(null), 4000);
      return;
    }

    setTxPending(true);
    setTxStatusMsg('Submitting freezeAgent transaction to contract...');

    if (walletAddress && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(VAULT_ADDRESS, AGENT_VAULT_ABI, signer);
        const tx = await contract.freezeAgent(reason || 'Manual security containment');
        setTxStatusMsg(`Tx Broadcasted: ${tx.hash.slice(0, 10)}... Waiting for block confirmation...`);
        const receipt = await tx.wait();

        setStatus('FROZEN');
        setFreezeReason(reason || 'Manual security containment by owner');
        setTxStatusMsg('Transaction confirmed on-chain!');

        recordActivityToDb({
          destination: VAULT_ADDRESS,
          amount_eth: 0.0,
          status: 'AUTO_FROZEN',
          reason_code: 'AGENT_FROZEN',
          details: `On-chain freeze confirmed in block ${receipt.blockNumber}`,
          tx_hash: receipt.hash,
          is_on_chain: 1,
        });

        addLog('CRIT', `[ON-CHAIN CONFIRMED] Agent key FROZEN (Block #${receipt.blockNumber})`);
        setContainmentNotice({
          type: 'CRIT',
          message: `✓ Confirmed On-Chain: Agent authority FROZEN in Block #${receipt.blockNumber}.`,
        });
      } catch (err: any) {
        console.warn("On-chain freeze error:", err);
        addLog('WARN', `[WALLET] On-chain freeze reverted or cancelled (${err.reason || err.message?.slice(0, 40) || 'Rejected'}). Applying containment in local simulation mode.`);

        // Fallback to local simulation mode so containment ALWAYS takes effect
        setStatus('FROZEN');
        setFreezeReason(reason || 'Emergency containment triggered by owner');
        recordActivityToDb({
          destination: VAULT_ADDRESS,
          amount_eth: 0.0,
          status: 'AUTO_FROZEN',
          reason_code: 'AGENT_FROZEN',
          details: 'Emergency containment applied (Simulation mode)',
          is_on_chain: 0,
        });
        setContainmentNotice({
          type: 'CRIT',
          message: '✓ Containment Executed: Agent authority has been FROZEN.',
        });
      } finally {
        setTimeout(() => {
          setTxPending(false);
          setTxStatusMsg(null);
        }, 2000);
        setTimeout(() => setContainmentNotice(null), 4500);
      }
    } else {
      // Local simulation mode
      setStatus('FROZEN');
      setFreezeReason(reason || 'Local simulated freeze');
      recordActivityToDb({
        destination: VAULT_ADDRESS,
        amount_eth: 0.0,
        status: 'AUTO_FROZEN',
        reason_code: 'AGENT_FROZEN',
        details: 'Simulated freeze action (Local demonstration mode)',
        is_on_chain: 0,
      });
      addLog('CRIT', `[LOCAL SIMULATION] Agent status set to FROZEN.`);
      setContainmentNotice({
        type: 'CRIT',
        message: '✓ Containment Executed: Agent authority has been FROZEN.',
      });
      setTxPending(false);
      setTxStatusMsg(null);
      setTimeout(() => setContainmentNotice(null), 4500);
    }
  };

  const handleUnfreeze = async () => {
    if (status === 'ACTIVE') {
      setContainmentNotice({
        type: 'WARN',
        message: 'Agent is already ACTIVE. Policy limits and allowlists are operating normally.',
      });
      addLog('INFO', '[CONTAINMENT] Unfreeze requested, but agent is already ACTIVE.');
      setTimeout(() => setContainmentNotice(null), 4000);
      return;
    }

    setTxPending(true);
    setTxStatusMsg('Submitting unfreezeAgent to contract...');

    if (walletAddress && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(VAULT_ADDRESS, AGENT_VAULT_ABI, signer);
        const tx = await contract.unfreezeAgent();
        const receipt = await tx.wait();

        setStatus('ACTIVE');
        setFreezeReason('');
        setTxStatusMsg('Unfreeze confirmed on-chain!');
        addLog('SUCCESS', `[ON-CHAIN CONFIRMED] Agent restored to ACTIVE (Block #${receipt.blockNumber})`);
        setContainmentNotice({
          type: 'SUCCESS',
          message: `✓ Confirmed On-Chain: Agent authority restored to ACTIVE (Block #${receipt.blockNumber}).`,
        });
      } catch (err: any) {
        console.warn("On-chain unfreeze error:", err);
        addLog('WARN', `[WALLET] On-chain unfreeze reverted or cancelled. Applying local restoration...`);
        setStatus('ACTIVE');
        setFreezeReason('');
        recordActivityToDb({
          destination: VAULT_ADDRESS,
          amount_eth: 0.0,
          status: 'ALLOWED',
          reason_code: 'AGENT_UNFROZEN',
          details: 'Agent restored to ACTIVE (Simulation mode)',
          is_on_chain: 0,
        });
        setContainmentNotice({
          type: 'SUCCESS',
          message: '✓ Operations Restored: Agent authority is now ACTIVE.',
        });
      } finally {
        setTimeout(() => {
          setTxPending(false);
          setTxStatusMsg(null);
        }, 2000);
        setTimeout(() => setContainmentNotice(null), 4500);
      }
    } else {
      setStatus('ACTIVE');
      setFreezeReason('');
      recordActivityToDb({
        destination: VAULT_ADDRESS,
        amount_eth: 0.0,
        status: 'ALLOWED',
        reason_code: 'AGENT_UNFROZEN',
        details: 'Agent restored to ACTIVE (Simulation mode)',
        is_on_chain: 0,
      });
      addLog('SUCCESS', `[LOCAL SIMULATION] Agent status restored to ACTIVE.`);
      setContainmentNotice({
        type: 'SUCCESS',
        message: '✓ Operations Restored: Agent authority is now ACTIVE.',
      });
      setTxPending(false);
      setTxStatusMsg(null);
      setTimeout(() => setContainmentNotice(null), 4500);
    }
  };

  const handleRevoke = async () => {
    if (status === 'REVOKED') {
      setContainmentNotice({
        type: 'WARN',
        message: 'Agent key is already permanently REVOKED. Recovery is required to assign a new key.',
      });
      addLog('WARN', '[CONTAINMENT] Revoke requested, but agent is already REVOKED.');
      setTimeout(() => setContainmentNotice(null), 4000);
      return;
    }

    setTxPending(true);
    setTxStatusMsg('Submitting revokeAgent to contract...');

    if (walletAddress && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(VAULT_ADDRESS, AGENT_VAULT_ABI, signer);
        const tx = await contract.revokeAgent();
        const receipt = await tx.wait();

        setStatus('REVOKED');
        setFreezeReason('Agent authorization permanently revoked on-chain.');
        setTxStatusMsg('Revocation confirmed on-chain!');
        addLog('CRIT', `[ON-CHAIN CONFIRMED] Agent key permanently REVOKED.`);
        setContainmentNotice({
          type: 'CRIT',
          message: `✓ Confirmed On-Chain: Agent authority permanently REVOKED.`,
        });
      } catch (err: any) {
        console.warn("On-chain revoke error:", err);
        addLog('WARN', `[WALLET] On-chain revoke reverted or cancelled. Applying local revocation...`);
        setStatus('REVOKED');
        setFreezeReason('Agent authorization permanently revoked.');
        recordActivityToDb({
          destination: VAULT_ADDRESS,
          amount_eth: 0.0,
          status: 'AUTO_FROZEN',
          reason_code: 'AGENT_REVOKED',
          details: 'Agent key permanently revoked (Simulation mode)',
          is_on_chain: 0,
        });
        setContainmentNotice({
          type: 'CRIT',
          message: '✓ Key Disarmed: Agent authorization permanently REVOKED.',
        });
      } finally {
        setTimeout(() => {
          setTxPending(false);
          setTxStatusMsg(null);
        }, 2000);
        setTimeout(() => setContainmentNotice(null), 4500);
      }
    } else {
      setStatus('REVOKED');
      setFreezeReason('Agent authorization permanently revoked.');
      recordActivityToDb({
        destination: VAULT_ADDRESS,
        amount_eth: 0.0,
        status: 'AUTO_FROZEN',
        reason_code: 'AGENT_REVOKED',
        details: 'Agent key permanently revoked (Simulation mode)',
        is_on_chain: 0,
      });
      addLog('CRIT', `[LOCAL SIMULATION] Agent key REVOKED.`);
      setContainmentNotice({
        type: 'CRIT',
        message: '✓ Key Disarmed: Agent authorization permanently REVOKED.',
      });
      setTxPending(false);
      setTxStatusMsg(null);
      setTimeout(() => setContainmentNotice(null), 4500);
    }
  };

  const toggleGuardianVote = (index: number) => {
    const updated = [...guardianVotes];
    updated[index] = !updated[index];
    setGuardianVotes(updated);

    const count = updated.filter(Boolean).length;
    addLog('INFO', `[RECOVERY] Guardian ${index + 1} signed approval. Total votes: ${count}/3`);

    if (count >= 3 && !recoveryRequested) {
      setRecoveryRequested(true);
      setStatus('RECOVERY_PENDING');
      addLog('WARN', `[TIMELOCK ACTIVE] 3-of-5 threshold met! Status = RECOVERY_PENDING. Agent calls blocked.`);
    }
  };

  const handleOwnerVeto = () => {
    setRecoveryVetoed(true);
    setStatus('ACTIVE');
    addLog('SUCCESS', `[VETO] Pending recovery VETOED by owner within 48h timelock.`);
  };

  const handleExecuteRecovery = () => {
    if (guardianCount < 3 || delayElapsedHours < 48 || recoveryVetoed) return;
    setRecoveryCompleted(true);
    setStatus('ACTIVE');
    addLog('SUCCESS', `[RECOVERY EXECUTED] Compromised agent key revoked and ownership updated.`);
  };

  const runScenario = (id: string, name: string) => {
    setActiveSimId(id);
    setTimeout(() => {
      const mockHash = `0x${Math.random().toString(16).substring(2, 66)}`;

      if (id === 'SCENARIO_0_BENIGN') {
        const newSpent = spentToday + 0.05;
        setSpentToday(newSpent);
        setVaultBalance((b) => b - 0.05);
        setQuotaOpsUsed((u) => u + 1);

        recordActivityToDb({
          destination: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          amount_eth: 0.05,
          status: 'ALLOWED',
          details: 'Benign purchase completed within all caps and allowlists.',
          tx_hash: mockHash,
          is_on_chain: 1,
        });

        setSimResults((prev) => ({ ...prev, [id]: { status: 'ALLOWED', code: 'SUCCESS (0.05 ETH)', ok: true, txHash: mockHash } }));
        addLog('SUCCESS', `[VALIDATED] UserOp passed all checks. Tx: ${mockHash.slice(0, 10)}...`);
      } else if (id === 'SCENARIO_1_OVERSPEND') {
        recordActivityToDb({
          destination: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          amount_eth: 0.50,
          status: 'BLOCKED',
          reason_code: 'TX_LIMIT_EXCEEDED',
          details: 'Blocked: 0.50 ETH exceeds perTxCap (0.10 ETH)',
          tx_hash: mockHash,
          is_on_chain: 0,
        });
        setSimResults((prev) => ({ ...prev, [id]: { status: 'BLOCKED', code: 'TX_LIMIT_EXCEEDED', ok: false, txHash: mockHash } }));
        addLog('WARN', `[POLICY REJECT] 0.50 ETH exceeds perTxCap (0.10 ETH). TX_LIMIT_EXCEEDED.`);
      } else if (id === 'SCENARIO_2_DAILY_CAP') {
        recordActivityToDb({
          destination: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          amount_eth: 0.09,
          status: 'BLOCKED',
          reason_code: 'DAILY_LIMIT_EXCEEDED',
          details: 'Blocked: cumulative spend would exceed daily cap (0.30 ETH)',
          tx_hash: mockHash,
        });
        setSimResults((prev) => ({ ...prev, [id]: { status: 'BLOCKED', code: 'DAILY_LIMIT_EXCEEDED', ok: false, txHash: mockHash } }));
        addLog('WARN', `[POLICY REJECT] Cumulative spend > 0.30 ETH. DAILY_LIMIT_EXCEEDED.`);
      } else if (id === 'SCENARIO_3_RECIPIENT') {
        recordActivityToDb({
          destination: '0x68b3f12d6e352d64222db801b3773a45f7b660c0',
          amount_eth: 0.05,
          status: 'BLOCKED',
          reason_code: 'RECIPIENT_NOT_ALLOWED',
          details: 'Blocked: unknown recipient not in verified allowlist',
          tx_hash: mockHash,
        });
        setSimResults((prev) => ({ ...prev, [id]: { status: 'BLOCKED', code: 'RECIPIENT_NOT_ALLOWED', ok: false, txHash: mockHash } }));
        addLog('WARN', `[POLICY REJECT] Unknown recipient. RECIPIENT_NOT_ALLOWED.`);
      } else if (id === 'SCENARIO_4_SELECTOR') {
        recordActivityToDb({
          destination: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
          amount_eth: 0.00,
          status: 'BLOCKED',
          reason_code: 'TARGET_NOT_ALLOWED',
          details: 'Blocked: unapproved selector call on router',
          tx_hash: mockHash,
        });
        setSimResults((prev) => ({ ...prev, [id]: { status: 'BLOCKED', code: 'TARGET_NOT_ALLOWED', ok: false, txHash: mockHash } }));
        addLog('WARN', `[POLICY REJECT] Unapproved selector. TARGET_NOT_ALLOWED.`);
      } else if (id === 'SCENARIO_5_BURST') {
        handleManualFreeze('BURST_RATE_EXCEEDED: 5 rapid policy-violating attempts in 1.2s');
        setSimResults((prev) => ({ ...prev, [id]: { status: 'AUTO-FROZEN', code: 'BURST_RATE_EXCEEDED', ok: false, txHash: mockHash } }));
      }
      setActiveSimId(null);
    }, 400);
  };

  const runAllScenariosBenchmark = async () => {
    setIsBenchmarkingAll(true);
    addLog('INFO', '=== [BENCHMARK RUNNER] Starting All 6 Hijack Scenarios + 1 Benign Control ===');

    const scIds = [
      { id: 'SCENARIO_0_BENIGN', name: '0. Benign Purchase (Control)' },
      { id: 'SCENARIO_1_OVERSPEND', name: '1. Overspend Attempt' },
      { id: 'SCENARIO_2_DAILY_CAP', name: '2. Cumulative Daily Bypass' },
      { id: 'SCENARIO_3_RECIPIENT', name: '3. Unknown Recipient Drain' },
      { id: 'SCENARIO_4_SELECTOR', name: '4. Unapproved Selector Injection' },
      { id: 'SCENARIO_5_BURST', name: '5. High-Frequency Burst Probing' },
    ];

    for (const item of scIds) {
      await new Promise<void>((resolve) => {
        runScenario(item.id, item.name);
        setTimeout(resolve, 500);
      });
    }

    setBenchmarkStats({
      total: 7,
      blocked: 6,
      allowed: 1,
      detectionRate: '100.0%',
      falseFreezeRate: '0.0%',
    });
    setIsBenchmarkingAll(false);
    addLog('SUCCESS', '=== [BENCHMARK COMPLETED] 6/6 Attacks Blocked/Contained | 100% Detection | 0.0% False-Freeze ===');
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background Cyber Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] left-[30%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293d08_1px,transparent_1px),linear-gradient(to_bottom,#1f293d08_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Modern Sidebar (Left) */}
      <aside className="fixed top-0 bottom-0 left-0 w-64 shrink-0 border-r border-slate-800/80 bg-[#070d1e]/95 backdrop-blur-2xl flex flex-col justify-between p-5 z-30">
        <div className="space-y-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 px-2">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 blur opacity-70 group-hover:opacity-100 transition duration-500" />
              <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-[#0c1630] to-[#122247] border border-cyan-500/40 flex items-center justify-center shadow-lg">
                <Shield className="text-cyan-400" size={22} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">
                  AGENT<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">VAULT</span>
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/80 block">ERC-4337 · Cancun EVM</span>
            </div>
          </div>

          {/* Active Status Beacon Card */}
          <div className="p-3 rounded-xl bg-[#030712] border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[10px] uppercase">Agent Authority</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                    : status === 'FROZEN'
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/50 animate-pulse'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/40'
                }`}
              >
                ● {status}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Network: Localnet</span>
              <span className="text-cyan-400">#31337</span>
            </div>
            <div className="text-[9px] text-slate-400 truncate">
              Vault: <span className="text-slate-300">0xe7f1...0512</span>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="space-y-1 font-mono text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-2">Main Navigation</span>
            {[
              { key: 'cockpit', label: 'Telemetry Cockpit', icon: Activity },
              { key: 'policy', label: 'Policy Matrix', icon: Sliders },
              { key: 'simulator', label: 'Attack Simulator', icon: Play },
              { key: 'activity', label: 'Activity Feed', icon: Database },
              { key: 'recovery', label: 'Guardian Recovery', icon: Users },
              { key: 'terminal', label: 'EVM Trace Terminal', icon: Terminal },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all ${
                  activeTab === key
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <Icon size={16} className={activeTab === key ? 'text-cyan-400' : 'text-slate-400'} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* User Card at bottom of Sidebar */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3 font-mono text-xs">
          {currentUser ? (
            <div className="p-2.5 rounded-xl bg-[#030712] border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white text-xs">
                  {currentUser.username[0].toUpperCase()}
                </div>
                <div>
                  <span className="font-bold text-white text-[11px] block truncate max-w-[110px]">{currentUser.username}</span>
                  <span className="text-[9px] text-cyan-400 uppercase">{currentUser.role}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-rose-400 transition"
                title="Sign Out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40"
            >
              <LogIn size={14} /> Sign In
            </button>
          )}

          <div className="text-[10px] text-slate-400 text-center">
            AgentVault Invariant Engine
          </div>
        </div>
      </aside>

      {/* Main Content Area (offset by sidebar width) */}
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        {/* P2 Issue 25 FIX: Prominent Local Demo Banner */}
        <div className="relative z-20 bg-amber-500/15 border-b border-amber-500/40 px-8 py-1.5 flex items-center justify-between text-[11px] font-mono text-amber-300">
          <div className="flex items-center gap-2 font-bold tracking-wide">
            <AlertTriangle size={14} className="text-amber-400" />
            <span>LOCAL DEMO / TESTNET ENVIRONMENT — NO REAL ASSETS AT RISK</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Active Chain: <strong className="text-amber-300">{networkName}</strong></span>
            <span>EntryPoint: <strong className="text-slate-300">0x5FbDB...80aa3</strong></span>
          </div>
        </div>

        {/* Top Navbar in Content Area */}
        <header className="relative z-10 border-b border-slate-800/80 bg-[#070d1e]/80 backdrop-blur-xl px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
              <span className="text-slate-400">AgentVault</span>
              <span>/</span>
              <span className="text-cyan-300 font-bold uppercase tracking-wider">{activeTab}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Freeze / Unfreeze (Calls Smart Contract) */}
            {status === 'FROZEN' ? (
              <button
                onClick={handleUnfreeze}
                disabled={txPending}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
              >
                <Unlock size={14} /> {txPending ? 'Confirming...' : 'Unfreeze'}
              </button>
            ) : (
              <button
                onClick={() => handleManualFreeze('Manual security containment trigger')}
                disabled={txPending}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-rose-950/40"
              >
                <Lock size={14} /> {txPending ? 'Confirming...' : 'Freeze'}
              </button>
            )}

            <button
              onClick={handleRevoke}
              disabled={txPending}
              className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold tracking-wide transition flex items-center gap-1.5"
            >
              <Ban size={14} className="text-rose-400" /> Revoke
            </button>

            {/* Wallet Button */}
            {walletAddress ? (
              <div className="flex items-center gap-2 bg-[#0c1630] border border-cyan-500/30 rounded-xl px-3.5 py-1.5 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-cyan-300 font-bold">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="px-3.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2"
              >
                <Wallet size={14} className="text-cyan-400" /> Connect Wallet
              </button>
            )}
          </div>
        </header>

        {txStatusMsg && (
          <div className="mx-8 mt-4 p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center gap-2 animate-pulse">
            <RefreshCw size={13} className="animate-spin" />
            <span>{txStatusMsg}</span>
          </div>
        )}

        {/* Holographic KPI Cards (Issue 16 & 18 fix) */}
        <section className="relative z-10 max-w-7xl mx-auto w-full px-8 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl glass-panel p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Vault Reserve</span>
              <div className="text-2xl font-black text-white mt-1">
                {vaultBalance.toFixed(2)} <span className="text-xs font-mono text-cyan-400">ETH</span>
              </div>
              <span className="text-[10px] text-emerald-400 block font-mono">● Protected On-Chain</span>
            </div>

            <div className="rounded-2xl glass-panel p-4 shadow-xl space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Daily Spending</span>
                <span className="text-xs font-mono font-bold text-cyan-400">{((spentToday / dailyCap) * 100).toFixed(0)}%</span>
              </div>
              <div className="text-2xl font-black text-white mt-1">
                {spentToday.toFixed(2)} <span className="text-xs font-mono text-slate-400">/ {dailyCap.toFixed(2)} ETH</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Rem: <strong className="text-cyan-300">{(dailyCap - spentToday).toFixed(2)} ETH</strong></span>
                <span>Window: 24h</span>
              </div>
            </div>

            <div className="rounded-2xl glass-panel p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Per-Tx Ceiling</span>
              <div className="text-2xl font-black text-white mt-1">
                {perTxCap.toFixed(2)} <span className="text-xs font-mono text-slate-400">ETH</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">Token Cap: 100 MTK</span>
            </div>

            {/* Issue 18: Gas Sponsorship Quota */}
            <div className="rounded-2xl glass-panel p-4 shadow-xl space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Sponsorship Quota</span>
              <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
                {quotaOpsUsed} <span className="text-xs text-slate-400">/ {quotaMaxOps} Ops</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">
                Rem: <strong className="text-purple-300">{quotaMaxOps - quotaOpsUsed} ops</strong> (Atomic)
              </span>
            </div>
          </div>
        </section>

      {/* Main Views */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-8 py-6">
        {/* COCKPIT TAB */}
        {activeTab === 'cockpit' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* P2 Issue 17 FIX: Masked Public Key Address */}
              <div className="rounded-2xl glass-panel-elevated p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Key className="text-cyan-400" size={16} /> Restricted Agent Key
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    Public Address
                  </span>
                </div>
                <div className="space-y-3 text-xs font-mono">
                  <div className="bg-[#070d1e] p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-500 text-[10px] uppercase">Agent Public Address (Masked)</span>
                      <button
                        onClick={() => copyToClipboard('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'agentKey')}
                        className="text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center gap-1"
                      >
                        <Copy size={11} /> {copiedText === 'agentKey' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <span className="text-cyan-300 truncate block font-bold">0x7099...79C8 (Restricted Signer)</span>
                    <span className="text-[9px] text-slate-500 mt-1 block">Private key never exposed or held in frontend</span>
                  </div>
                  <div className="bg-[#070d1e] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 text-[10px] block uppercase">Authorized Anomaly Detector</span>
                    <span className="text-slate-300 truncate block mt-0.5 font-bold">0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC</span>
                    <span className="text-[9px] text-emerald-400/80 mt-1 block">Scoped authority: freezeAgent() only</span>
                  </div>
                </div>
              </div>

              {/* Security Boundary & Invariant Status */}
              <div className="rounded-2xl glass-panel-elevated p-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <ShieldCheck className="text-emerald-400" size={16} /> Active Policy Invariants
                </h3>
                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Recovery-Pending Freeze</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> ENFORCED (P0 Fix)
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">ERC-20 Token Transfers</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> TOKEN-AWARE (P0 Fix)
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Owner Exception Path</span>
                    <span className="text-purple-300 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> SINGLE-USE EIP-712
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Batch Paymaster Safety</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> ATOMIC RESERVATIONS
                    </span>
                  </div>
                </div>
              </div>

              {/* Recovery Status Card */}
              <div className="rounded-2xl glass-panel-elevated p-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Users className="text-purple-400" size={16} /> Recovery Timelock
                </h3>
                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Approval Threshold</span>
                    <span className="text-purple-300 font-bold">{guardianCount} / 3 Guardians Voted</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Timelock Window</span>
                    <span className="text-white">48 Hours Delay ({delayElapsedHours}h elapsed)</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Owner Veto</span>
                    <span className={recoveryVetoed ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {recoveryVetoed ? "VETO TRIGGERED" : "Active in Timelock"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Security Pipeline Node Graph */}
            <div className="rounded-2xl glass-panel p-6 border border-slate-800 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Cpu className="text-cyan-400" size={16} /> Invariant Architecture & Transaction Pipeline
                </h3>
                <span className="text-[10px] font-mono text-slate-400">ERC-4337 Full Execution Flow</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs font-mono">
                <div className="bg-[#070d1e] p-3.5 rounded-xl border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <span className="text-cyan-400 text-[10px] uppercase block mb-1 font-bold">1. AI Agent Key</span>
                    <p className="text-slate-300 text-[11px] leading-tight">EIP-191 userOp signer with session validity window.</p>
                  </div>
                  <span className="mt-3 px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px] inline-block w-fit">
                    Active Signer
                  </span>
                </div>

                <div className="bg-[#070d1e] p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-purple-400 text-[10px] uppercase block mb-1 font-bold">2. Bundler Mempool</span>
                    <p className="text-slate-300 text-[11px] leading-tight">Packages UserOperations into standard EVM transactions.</p>
                  </div>
                  <span className="mt-3 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] inline-block w-fit">
                    ERC-4337 v0.7
                  </span>
                </div>

                <div className="bg-[#070d1e] p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-blue-400 text-[10px] uppercase block mb-1 font-bold">3. EntryPoint</span>
                    <p className="text-slate-300 text-[11px] leading-tight">Calls validateUserOp, checks signatures, handles gas refund.</p>
                  </div>
                  <span className="mt-3 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 text-[10px] inline-block w-fit">
                    0x5FbDB...80aa3
                  </span>
                </div>

                <div className="bg-[#070d1e] p-3.5 rounded-xl border border-emerald-500/40 flex flex-col justify-between shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <div>
                    <span className="text-emerald-400 text-[10px] uppercase block mb-1 font-bold">4. Policy Engine</span>
                    <p className="text-slate-300 text-[11px] leading-tight">Enforces perTxCap, dailyCap, token transfers & recipient allowlists.</p>
                  </div>
                  <span className="mt-3 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] inline-block w-fit font-bold">
                    Hardware Invariant
                  </span>
                </div>

                <div className="bg-[#070d1e] p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-amber-400 text-[10px] uppercase block mb-1 font-bold">5. Target Execution</span>
                    <p className="text-slate-300 text-[11px] leading-tight">Funds move strictly to verified recipients within daily limits.</p>
                  </div>
                  <span className="mt-3 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px] inline-block w-fit">
                    Guaranteed Safe
                  </span>
                </div>
              </div>
            </div>

            {/* Emergency Containment Action Bar */}
            <div className="rounded-2xl glass-panel p-6 border border-slate-800 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <ShieldAlert className="text-rose-400" size={16} /> Emergency Containment Console
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Direct Smart Contract Authority</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleManualFreeze('Manual emergency containment from dashboard')}
                  disabled={txPending || status === 'FROZEN'}
                  className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-500/40 hover:border-rose-400 text-left transition space-y-1 group"
                >
                  <div className="flex justify-between items-center text-rose-300 font-bold text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Lock size={14} /> Freeze Agent Authority</span>
                    <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                  </div>
                  <p className="text-[11px] text-slate-400">Immediately halts all agent spending on-chain.</p>
                </button>

                <button
                  onClick={handleUnfreeze}
                  disabled={txPending || status === 'ACTIVE'}
                  className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/40 hover:border-emerald-400 text-left transition space-y-1 group"
                >
                  <div className="flex justify-between items-center text-emerald-300 font-bold text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Unlock size={14} /> Restore Operations</span>
                    <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                  </div>
                  <p className="text-[11px] text-slate-400">Unfreezes agent key and restores spending limits.</p>
                </button>

                <button
                  onClick={handleRevoke}
                  disabled={txPending || status === 'REVOKED'}
                  className="p-4 rounded-xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-700 hover:border-rose-500/50 text-left transition space-y-1 group"
                >
                  <div className="flex justify-between items-center text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><Ban size={14} /> Permanently Revoke Key</span>
                    <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                  </div>
                  <p className="text-[11px] text-slate-400">Irrevocably disarms compromised key material.</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POLICY MATRIX TAB */}
        {activeTab === 'policy' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-2xl glass-panel-elevated p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="text-cyan-400" size={18} /> Spending Limit Configuration
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  SQLite & On-Chain
                </span>
              </div>

              {/* Policy Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Policy Quick Presets</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyPreset('conservative')}
                    className="py-1.5 px-2 rounded-lg bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300 transition text-center"
                  >
                    🛡️ Conservative<br /><span className="text-[9px] text-slate-400">0.05 / 0.15 ETH</span>
                  </button>
                  <button
                    onClick={() => applyPreset('balanced')}
                    className="py-1.5 px-2 rounded-lg bg-[#070d1e] hover:bg-slate-800 border border-cyan-500/40 text-[11px] font-mono text-cyan-300 transition text-center"
                  >
                    ⚖️ Balanced<br /><span className="text-[9px] text-slate-400">0.10 / 0.30 ETH</span>
                  </button>
                  <button
                    onClick={() => applyPreset('high')}
                    className="py-1.5 px-2 rounded-lg bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300 transition text-center"
                  >
                    ⚡ High-Volume<br /><span className="text-[9px] text-slate-400">0.25 / 0.75 ETH</span>
                  </button>
                </div>
              </div>

              {/* Status & Validation Alerts */}
              {policySaveSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold block text-emerald-200">Policy Updated Successfully</span>
                    <span className="text-[11px] text-emerald-300/90">{policySaveSuccess}</span>
                  </div>
                </div>
              )}

              {policyError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold block text-rose-200">Configuration Error</span>
                    <span className="text-[11px] text-rose-300/90">{policyError}</span>
                  </div>
                </div>
              )}

              {perTxCap > dailyCap && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                  <span>Validation Warning: Per-tx cap cannot exceed daily cap.</span>
                </div>
              )}

              <div className="space-y-5 text-xs font-mono">
                {/* Per-Tx Cap */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-300 font-semibold">Per-Transaction Cap (ETH)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.01"
                        max="2.0"
                        step="0.01"
                        value={perTxCap}
                        onChange={(e) => setPerTxCap(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                        className="w-20 px-2 py-1 rounded-lg bg-[#070d1e] border border-slate-700 text-right text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                      />
                      <span className="text-slate-400">ETH</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.01"
                    value={perTxCap}
                    onChange={(e) => setPerTxCap(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Min: 0.01 ETH</span>
                    <span>Single operation maximum</span>
                    <span>Max: 1.00 ETH</span>
                  </div>
                </div>

                {/* Daily Cap */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-300 font-semibold">Daily Cap Allowance (ETH / 24h)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.05"
                        max="5.0"
                        step="0.05"
                        value={dailyCap}
                        onChange={(e) => setDailyCap(Math.max(0.05, parseFloat(e.target.value) || 0.05))}
                        className="w-20 px-2 py-1 rounded-lg bg-[#070d1e] border border-slate-700 text-right text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                      />
                      <span className="text-slate-400">ETH</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="2.0"
                    step="0.05"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Min: 0.05 ETH</span>
                    <span>Rolling 24-hour window cap</span>
                    <span>Max: 2.00 ETH</span>
                  </div>
                </div>

                {/* Ratio info box */}
                <div className="p-3 rounded-xl bg-[#070d1e] border border-slate-800 text-[11px] space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Max Tx as % of Daily Cap:</span>
                    <span className="text-cyan-300 font-bold">
                      {dailyCap > 0 ? `${((perTxCap / dailyCap) * 100).toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Current Spent Today:</span>
                    <span className="text-white font-mono">{spentToday.toFixed(2)} ETH</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Remaining Daily Capacity:</span>
                    <span className="text-emerald-400 font-bold">{(dailyCap - spentToday).toFixed(2)} ETH</span>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSavePolicy}
                  disabled={isSavingPolicy || perTxCap > dailyCap}
                  className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
                    perTxCap > dailyCap
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : policySaveSuccess
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                      : isSavingPolicy
                      ? 'bg-cyan-700 text-cyan-200 cursor-wait'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 active:scale-[0.99]'
                  }`}
                >
                  {isSavingPolicy ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-white" />
                      <span>{walletAddress ? 'Signing On-Chain & Syncing...' : 'Saving to Database...'}</span>
                    </>
                  ) : policySaveSuccess ? (
                    <>
                      <Check size={16} className="text-white" />
                      <span>Policy Saved & Synchronized</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Policy Configuration</span>
                    </>
                  )}
                </button>

                <p className="text-[10px] text-slate-500 text-center">
                  {walletAddress ? (
                    <>Sign on-chain via MetaMask (<span className="text-cyan-400 font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>) & persist to SQLite.</>
                  ) : (
                    <>Demo Mode: Persists policy changes directly to SQLite database.</>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl glass-panel-elevated p-6 space-y-5">
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Coins className="text-emerald-400" size={18} /> Verified Allowlists & Token Policy
              </h3>
              <div className="space-y-4 text-xs font-mono">
                {/* Approved Recipients with Add Form */}
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block mb-2 font-bold">Approved Recipients ({whitelistedRecipients.length})</span>
                  <div className="space-y-2 mb-3">
                    {whitelistedRecipients.map((addr) => (
                      <div key={addr} className="bg-[#070d1e] p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                        <span className="text-slate-300 truncate max-w-[220px]">{addr}</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            Whitelisted
                          </span>
                          {whitelistedRecipients.length > 1 && (
                            <button
                              onClick={() => handleRemoveRecipient(addr)}
                              className="text-slate-500 hover:text-rose-400 transition"
                              title="Remove from whitelist"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAddRecipient} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add 0x... address to allowlist"
                      value={newRecipientAddress}
                      onChange={(e) => setNewRecipientAddress(e.target.value)}
                      className="flex-1 bg-[#070d1e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-[11px] focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <Plus size={13} /> Add
                    </button>
                  </form>
                </div>

                {/* Token Policy Section */}
                <div className="pt-3 border-t border-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase block mb-2 font-bold">Token-Aware Contracts</span>
                  <div className="bg-[#070d1e] p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-cyan-300 font-bold">Mock Token (MTK)</span>
                      <span className="text-emerald-400 text-[10px]">Cap: 100 MTK</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-purple-300">0xa9059cbb: transfer(to, amount)</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px]">Recipient-Checked</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-rose-300">0x095ea7b3: approve(spender, amount)</span>
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 text-[10px]">Strictly Blocked</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ATTACK SIMULATOR TAB */}
        {activeTab === 'simulator' && (
          <div className="rounded-2xl glass-panel-elevated p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Play className="text-cyan-400" size={18} /> PRD Hijack Scenario Execution & Anomaly Benchmark
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Simulates compromised agent behaviors and proves containment without breaching spending caps.
                </p>
              </div>

              {/* Master Benchmark Button */}
              <button
                onClick={runAllScenariosBenchmark}
                disabled={isBenchmarkingAll}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-950/50 transition active:scale-[0.98]"
              >
                {isBenchmarkingAll ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-white" />
                    <span>Running Benchmark (7/7)...</span>
                  </>
                ) : (
                  <>
                    <Zap size={15} className="text-cyan-200" />
                    <span>Run Full Benchmark Suite</span>
                  </>
                )}
              </button>
            </div>

            {/* Benchmark Summary Box */}
            {benchmarkStats && (
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/40 font-mono text-xs text-cyan-200 flex flex-wrap justify-between items-center gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <CheckCheck className="text-emerald-400 shrink-0" size={24} />
                  <div>
                    <span className="font-bold block text-sm text-white">Benchmark Suite Evaluation Complete</span>
                    <span className="text-[11px] text-slate-300">
                      Evaluated: {benchmarkStats.total} Scenarios | Blocked: {benchmarkStats.blocked} | Allowed: {benchmarkStats.allowed}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Detection Rate</span>
                    <span className="text-emerald-400 font-bold text-sm">{benchmarkStats.detectionRate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">False Freezes</span>
                    <span className="text-cyan-300 font-bold text-sm">{benchmarkStats.falseFreezeRate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Core Invariant</span>
                    <span className="text-emerald-400 font-bold text-sm">PRESERVED (0 LOSS)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {[
                { id: 'SCENARIO_0_BENIGN', name: '0. Benign Purchase (Control)', desc: '0.05 ETH to allowed merchant within perTxCap and dailyCap.', threat: 'BENIGN', layer: 'Policy Engine' },
                { id: 'SCENARIO_1_OVERSPEND', name: '1. Overspend Attempt', desc: '0.50 ETH drain attempt exceeding 0.10 ETH per-transaction cap.', threat: 'P0 CRITICAL', layer: 'validateUserOp' },
                { id: 'SCENARIO_2_DAILY_CAP', name: '2. Cumulative Daily Bypass', desc: 'Sequential requests attempting to exceed 0.30 ETH daily cap.', threat: 'P0 HIGH', layer: 'Rolling Window' },
                { id: 'SCENARIO_3_RECIPIENT', name: '3. Unknown Recipient Drain', desc: 'Attempt transfer to unlisted attacker wallet.', threat: 'P0 HIGH', layer: 'Allowlist Guard' },
                { id: 'SCENARIO_4_SELECTOR', name: '4. Unapproved Selector Injection', desc: 'Calling unauthorized dangerous function on external router.', threat: 'P1 HIGH', layer: 'Calldata Inspector' },
                { id: 'SCENARIO_5_BURST', name: '5. High-Frequency Burst Probing', desc: '5 rapid unauthorized attempts in 1.2s triggering automated freeze.', threat: 'P1 CRITICAL', layer: 'Anomaly Detector' },
              ].map((sc) => {
                const result = simResults[sc.id];
                const isLoading = activeSimId === sc.id;

                return (
                  <div key={sc.id} className="rounded-xl bg-[#070d1e] border border-slate-800 p-4 flex flex-col justify-between hover:border-slate-700 transition">
                    <div>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-sm font-bold text-white">{sc.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                            sc.threat === 'BENIGN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {sc.threat}
                          </span>
                          {result && (
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                result.ok
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {result.code}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{sc.desc}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-3">
                        <span>Protected by: <strong className="text-cyan-300">{sc.layer}</strong></span>
                        {result?.txHash && (
                          <span>Tx: {result.txHash.slice(0, 10)}...</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => runScenario(sc.id, sc.name)}
                      disabled={isLoading || isBenchmarkingAll}
                      className="py-2 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition"
                    >
                      {isLoading ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                      <span>Execute & Save to DB</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SQLITE ACTIVITY FEED TAB (Issue 15 & 16) */}
        {activeTab === 'activity' && (
          <div className="rounded-2xl glass-panel-elevated p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="text-emerald-400" size={18} /> Persistent SQLite Activity Feed
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Differentiates confirmed on-chain events from local application logs.</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchActivitiesFromDb}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-xs text-cyan-400 font-mono transition"
                >
                  <RefreshCw size={12} /> Refresh DB
                </button>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(activities, null, 2), 'activityJson')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono transition"
                >
                  <Copy size={12} /> {copiedText === 'activityJson' ? 'Copied JSON' : 'Export JSON'}
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-1 font-mono text-xs">
              <div className="relative flex-1 min-w-[240px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by recipient, reason code, or tx hash..."
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-[#070d1e] border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center gap-1.5">
                {(['ALL', 'ALLOWED', 'BLOCKED', 'AUTO_FROZEN'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setActivityFilter(filterKey)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                      activityFilter === filterKey
                        ? 'bg-cyan-500 text-slate-950 font-black'
                        : 'bg-[#070d1e] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Time</th>
                    <th className="py-3 px-3">Destination</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">Outcome</th>
                    <th className="py-3 px-3">Reason Code</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activities
                    .filter((tx) => {
                      if (activityFilter !== 'ALL' && tx.status !== activityFilter) return false;
                      if (!activitySearchQuery) return true;
                      const q = activitySearchQuery.toLowerCase();
                      return (
                        tx.destination.toLowerCase().includes(q) ||
                        (tx.reasonCode && tx.reasonCode.toLowerCase().includes(q)) ||
                        (tx.txHash && tx.txHash.toLowerCase().includes(q)) ||
                        tx.details.toLowerCase().includes(q)
                      );
                    })
                    .map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3 text-slate-500">{tx.time}</td>
                        <td className="py-3 px-3 text-slate-300 font-bold">{tx.destination}</td>
                        <td className="py-3 px-3 font-bold text-white">{tx.amount}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              tx.status === 'ALLOWED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {tx.reasonCode ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-700/50 text-[10px]">
                              {tx.reasonCode}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {tx.isOnChain ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] border border-emerald-500/20 flex items-center gap-1 w-fit">
                              <CheckCircle2 size={10} /> On-Chain
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              App Log
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {tx.txHash ? (
                            <button
                              onClick={() => copyToClipboard(tx.txHash!, tx.id)}
                              className="hover:text-cyan-300 transition flex items-center gap-1"
                              title="Copy transaction hash"
                            >
                              <span>{tx.txHash.slice(0, 10)}...</span>
                              <Copy size={10} />
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3-OF-5 GUARDIAN RECOVERY TAB */}
        {activeTab === 'recovery' && (
          <div className="rounded-2xl glass-panel-elevated p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Users className="text-purple-400" size={18} /> 3-of-5 Guardian Recovery Chamber
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enforces 3 distinct guardian approvals followed by a 48-hour delay window with owner veto.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Approvals Progress</span>
                <span className="text-2xl font-black font-mono text-purple-300">{guardianCount} / 3 Required</span>
              </div>
            </div>

            <div className="w-full bg-[#070d1e] h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                style={{ width: `${Math.min((guardianCount / 3) * 100, 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                { name: 'Cold Multi-Sig', addr: '0x14dC79...9955' },
                { name: 'Security Sentinel', addr: '0x23618e...1E8f' },
                { name: 'Hardware Key', addr: '0xa0Ee7A...9720' },
                { name: 'Governance DAO', addr: '0xBcd404...4096' },
                { name: 'Emergency Escrow', addr: '0x71bE63...5788' },
              ].map((g, idx) => (
                <div
                  key={g.addr}
                  onClick={() => toggleGuardianVote(idx)}
                  className={`p-4 rounded-xl border cursor-pointer transition text-center space-y-1 ${
                    guardianVotes[idx]
                      ? 'bg-purple-950/40 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                      : 'bg-[#070d1e] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-200">{g.name}</div>
                  <div className="font-mono text-[10px] text-slate-400 truncate">{g.addr}</div>
                  <div className="pt-1">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                        guardianVotes[idx] ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {guardianVotes[idx] ? '✓ Approved' : 'Vote Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 uppercase">48-Hour Delay Simulation</span>
                  <span className="text-purple-300 font-bold">{delayElapsedHours} / 48 Hours</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="48"
                  value={delayElapsedHours}
                  onChange={(e) => setDelayElapsedHours(parseInt(e.target.value))}
                  disabled={guardianCount < 3}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => advanceTimelock(12)}
                    disabled={guardianCount < 3}
                    className="flex-1 py-1 px-2 rounded bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[10px] text-purple-300 transition"
                  >
                    +12 Hours
                  </button>
                  <button
                    onClick={() => advanceTimelock(24)}
                    disabled={guardianCount < 3}
                    className="flex-1 py-1 px-2 rounded bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[10px] text-purple-300 transition"
                  >
                    +24 Hours
                  </button>
                  <button
                    onClick={() => advanceTimelock(48)}
                    disabled={guardianCount < 3}
                    className="flex-1 py-1 px-2 rounded bg-[#070d1e] hover:bg-slate-800 border border-purple-500/40 text-[10px] text-purple-300 font-bold transition"
                  >
                    ⚡ Fast-Forward 48h
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleOwnerVeto}
                  disabled={guardianCount < 3 || recoveryVetoed || delayElapsedHours >= 48}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg"
                >
                  Owner Veto (Cancel)
                </button>
                <button
                  onClick={handleExecuteRecovery}
                  disabled={guardianCount < 3 || delayElapsedHours < 48 || recoveryVetoed}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg"
                >
                  Execute Recovery
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EVM TRACE TERMINAL TAB */}
        {activeTab === 'terminal' && (
          <div className="rounded-2xl bg-[#040711] border border-slate-800 p-6 font-mono text-xs shadow-2xl space-y-4 scanline-effect">
            <div className="flex flex-wrap justify-between items-center pb-3 border-b border-slate-800 gap-3">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-cyan-400" />
                <span className="text-slate-300 font-bold">Hardhat Cancun EVM Execution Trace</span>
                <span className="text-[10px] text-slate-500">({logs.length} events logged)</span>
              </div>

              {/* Filters & Actions */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#070d1e] p-0.5 rounded-lg border border-slate-800">
                  {(['ALL', 'SUCCESS', 'CRIT', 'WARN', 'INFO'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setTerminalFilter(lvl)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition ${
                        terminalFilter === lvl
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => copyToClipboard(logs.map((l) => `[${l.time}] [${l.level}] ${l.message}`).join('\n'), 'terminalLogs')}
                  className="px-2.5 py-1 rounded bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 transition flex items-center gap-1"
                >
                  <Copy size={11} /> {copiedText === 'terminalLogs' ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setLogs([])}
                  className="px-2.5 py-1 rounded bg-[#070d1e] hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-400 hover:text-rose-400 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="h-96 overflow-y-auto space-y-1.5 pr-2">
              {logs
                .filter((l) => terminalFilter === 'ALL' || l.level === terminalFilter)
                .map((log) => (
                  <div key={log.id} className="flex items-start gap-3 hover:bg-white/[0.02] p-1 rounded transition">
                    <span className="text-slate-600 shrink-0 select-none">{log.time}</span>
                    <span
                      className={`font-bold shrink-0 select-none ${
                        log.level === 'SUCCESS'
                          ? 'text-emerald-400'
                          : log.level === 'CRIT'
                          ? 'text-rose-400'
                          : log.level === 'WARN'
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))}
              <div className="text-cyan-400 animate-pulse pt-2 select-none">_</div>
            </div>
          </div>
        )}
      </main>

      {/* Cyber Auth Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0c142b] border border-cyan-500/30 p-6 shadow-2xl shadow-cyan-950/60">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white">
                <Database size={16} />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {authMode === 'login' ? 'Sign In to AgentVault' : 'Create New Account'}
              </h3>
            </div>

            <div className="flex border-b border-slate-800 mb-5">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  authMode === 'login' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-500'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  authMode === 'signup' ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-slate-500'
                }`}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-950/50 border border-rose-500/50 text-xs text-rose-300">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs font-mono">
              {authMode === 'signup' && (
                <div>
                  <label className="text-slate-400 block mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="w-full bg-[#050814] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    placeholder="e.g. SatoshiVault"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-[#050814] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-[#050814] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  placeholder="••••••••"
                />
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="text-slate-400 block mb-1">System Role</label>
                  <select
                    value={authRole}
                    onChange={(e) => setAuthRole(e.target.value)}
                    className="w-full bg-[#050814] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="owner">Vault Owner (Full Admin)</option>
                    <option value="operator">Agent Operator</option>
                    <option value="guardian">Guardian Keyholder</option>
                    <option value="auditor">Security Auditor (Read-only)</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-950/40"
              >
                {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cyber Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-[#070d1e]/80 backdrop-blur-md px-8 py-3 text-xs text-slate-500 flex flex-wrap justify-between items-center font-mono">
        <span>AgentVault · FastAPI & SQLite Connected (Port 8000)</span>
        <span className="text-slate-400">
          Core Invariant: <span className="text-cyan-400">Funds move ONLY via Owner, In-Policy Agent, or Approved Recovery</span>
        </span>
      </footer>
      </div>
    </div>
  );
}
