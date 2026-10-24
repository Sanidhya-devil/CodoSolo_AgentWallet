"""
AgentVault Database Module (SQLite)
Manages persistent user authentication, vault state, confirmed on-chain activity, and security alerts.
"""

import os
import sqlite3
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agentvault.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes tables and migrates schema."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        wallet_address TEXT,
        role TEXT DEFAULT 'owner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Vaults Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vaults (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        vault_address TEXT UNIQUE NOT NULL,
        owner_address TEXT NOT NULL,
        agent_key TEXT,
        status TEXT DEFAULT 'ACTIVE',
        per_tx_cap_eth REAL DEFAULT 0.1,
        daily_cap_eth REAL DEFAULT 0.3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

    # 3. Activity Logs Table with On-Chain Provenance (Issue 15 fix)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vault_address TEXT NOT NULL,
        sender TEXT NOT NULL,
        destination TEXT NOT NULL,
        amount_eth REAL NOT NULL,
        status TEXT NOT NULL,
        reason_code TEXT,
        details TEXT,
        tx_hash TEXT,
        block_number INTEGER,
        chain_id INTEGER DEFAULT 31337,
        is_on_chain INTEGER DEFAULT 0,
        event_name TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Check for missing columns in existing table (migration)
    cursor.execute("PRAGMA table_info(activity_logs)")
    columns = [row[1] for row in cursor.fetchall()]
    for col, col_type in [
        ("tx_hash", "TEXT"),
        ("block_number", "INTEGER"),
        ("chain_id", "INTEGER DEFAULT 31337"),
        ("is_on_chain", "INTEGER DEFAULT 0"),
        ("event_name", "TEXT"),
    ]:
        if col not in columns:
            try:
                cursor.execute(f"ALTER TABLE activity_logs ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

    # 4. Security Alerts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS security_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vault_address TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()
    conn.close()
    print("Database initialized successfully at:", DB_PATH)


if __name__ == "__main__":
    init_db()
