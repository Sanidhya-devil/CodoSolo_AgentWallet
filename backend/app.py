"""
AgentVault Backend Server (FastAPI + SQLite)
Provides authentication, user management, and persistent activity logging with on-chain evidence provenance.
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time
import re

from .db import get_db, init_db
from .auth import hash_password, verify_password, create_access_token, decode_access_token

# Initialize database on startup
init_db()

app = FastAPI(
    title="AgentVault API",
    description="Backend API for AgentVault AI Wallet Authentication, Policy State & Activity Persistence",
    version="1.0.0",
)

# P1 FIX (Issue 7): Restrict CORS to explicit trusted origins (no wildcard with credentials)
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------
class SignupRequest(BaseModel):
    email: str
    username: str
    password: str
    wallet_address: Optional[str] = None
    role: Optional[str] = "owner"


class LoginRequest(BaseModel):
    email: str
    password: str


class ActivityCreateRequest(BaseModel):
    vault_address: str
    sender: str
    destination: str
    amount_eth: float
    status: str
    reason_code: Optional[str] = None
    details: Optional[str] = None
    tx_hash: Optional[str] = None
    block_number: Optional[int] = None
    chain_id: Optional[int] = 31337
    is_on_chain: Optional[int] = 0
    event_name: Optional[str] = None


class AlertCreateRequest(BaseModel):
    vault_address: str
    type: str
    title: str
    details: str


class PolicyUpdateRequest(BaseModel):
    vault_address: str = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    per_tx_cap_eth: float
    daily_cap_eth: float
    tx_hash: Optional[str] = None
    is_on_chain: Optional[int] = 0


def validate_email_format(email: str) -> bool:
    return bool(re.match(r"^[^@]+@[^@]+\.[^@]+$", email))


# -----------------------------------------------------------------------------
# Dependency: Authenticated User (P1 FIX Issue 6)
# -----------------------------------------------------------------------------
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required: Bearer token missing")

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token is expired or invalid")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, username, wallet_address, role, created_at FROM users WHERE id = ?", (payload["sub"],))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="User account not found")

    return dict(row)


# Optional user for public feeds with degraded permissions
def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, username, wallet_address, role, created_at FROM users WHERE id = ?", (payload["sub"],))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


# -----------------------------------------------------------------------------
# Auth Endpoints
# -----------------------------------------------------------------------------
@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    if not validate_email_format(req.email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    conn = get_db()
    cursor = conn.cursor()

    clean_email = req.email.lower().strip()
    cursor.execute("SELECT id FROM users WHERE email = ?", (clean_email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    hashed_pw = hash_password(req.password)
    cursor.execute("""
    INSERT INTO users (email, username, password_hash, wallet_address, role)
    VALUES (?, ?, ?, ?, ?)
    """, (clean_email, req.username.strip(), hashed_pw, req.wallet_address, req.role or "owner"))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    token = create_access_token(user_id, clean_email, req.role or "owner")

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "email": clean_email,
            "username": req.username.strip(),
            "wallet_address": req.wallet_address,
            "role": req.role or "owner",
        },
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()

    clean_email = req.email.lower().strip()
    cursor.execute("SELECT id, email, username, password_hash, wallet_address, role FROM users WHERE email = ?", (clean_email,))
    row = cursor.fetchone()
    conn.close()

    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(row["id"], row["email"], row["role"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "username": row["username"],
            "wallet_address": row["wallet_address"],
            "role": row["role"],
        },
    }


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"success": True, "user": current_user}


# -----------------------------------------------------------------------------
# Activity & Alert Database Endpoints (P1 FIX Issue 6 & 15)
# -----------------------------------------------------------------------------
@app.get("/api/activity")
def get_activities(limit: int = 50, user: Optional[dict] = Depends(get_optional_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, vault_address, sender, destination, amount_eth, status, reason_code, details,
           tx_hash, block_number, chain_id, is_on_chain, event_name, timestamp
    FROM activity_logs
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    return {"success": True, "activities": [dict(r) for r in rows]}


@app.post("/api/activity")
def create_activity(req: ActivityCreateRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO activity_logs (
        vault_address, sender, destination, amount_eth, status, reason_code, details,
        tx_hash, block_number, chain_id, is_on_chain, event_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.vault_address,
        req.sender,
        req.destination,
        req.amount_eth,
        req.status,
        req.reason_code,
        req.details,
        req.tx_hash,
        req.block_number,
        req.chain_id or 31337,
        req.is_on_chain or 0,
        req.event_name,
    ))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return {"success": True, "id": new_id}


@app.get("/api/alerts")
def get_alerts(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, vault_address, type, title, details, resolved, timestamp
    FROM security_alerts
    ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    return {"success": True, "alerts": [dict(r) for r in rows]}


@app.post("/api/alerts")
def create_alert(req: AlertCreateRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO security_alerts (vault_address, type, title, details)
    VALUES (?, ?, ?, ?)
    """, (req.vault_address, req.type, req.title, req.details))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return {"success": True, "id": new_id}


# -----------------------------------------------------------------------------
# Policy Management Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/policy")
def get_policy(vault_address: str = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", user: Optional[dict] = Depends(get_optional_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT vault_address, owner_address, status, per_tx_cap_eth, daily_cap_eth, created_at
    FROM vaults
    WHERE vault_address = ?
    """, (vault_address,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("""
        INSERT INTO vaults (vault_address, owner_address, status, per_tx_cap_eth, daily_cap_eth)
        VALUES (?, ?, 'ACTIVE', 0.1, 0.3)
        """, (vault_address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"))
        conn.commit()
        conn.close()
        return {
            "success": True,
            "vault_address": vault_address,
            "owner_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "status": "ACTIVE",
            "per_tx_cap_eth": 0.1,
            "daily_cap_eth": 0.3,
        }
    conn.close()
    return {
        "success": True,
        "vault_address": row["vault_address"],
        "owner_address": row["owner_address"],
        "status": row["status"],
        "per_tx_cap_eth": row["per_tx_cap_eth"],
        "daily_cap_eth": row["daily_cap_eth"],
    }


@app.post("/api/policy")
def update_policy(req: PolicyUpdateRequest, user: Optional[dict] = Depends(get_optional_user)):
    if req.per_tx_cap_eth > req.daily_cap_eth:
        raise HTTPException(status_code=400, detail="perTxCap cannot exceed dailyCap")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM vaults WHERE vault_address = ?", (req.vault_address,))
    exists = cursor.fetchone()
    if exists:
        cursor.execute("""
        UPDATE vaults
        SET per_tx_cap_eth = ?, daily_cap_eth = ?
        WHERE vault_address = ?
        """, (req.per_tx_cap_eth, req.daily_cap_eth, req.vault_address))
    else:
        cursor.execute("""
        INSERT INTO vaults (vault_address, owner_address, status, per_tx_cap_eth, daily_cap_eth)
        VALUES (?, ?, 'ACTIVE', ?, ?)
        """, (req.vault_address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", req.per_tx_cap_eth, req.daily_cap_eth))

    cursor.execute("""
    INSERT INTO activity_logs (
        vault_address, sender, destination, amount_eth, status, reason_code, details,
        tx_hash, chain_id, is_on_chain, event_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.vault_address,
        user.get("email") if user else "VaultOwner",
        req.vault_address,
        0.0,
        "ALLOWED",
        "POLICY_UPDATED",
        f"Policy limits updated: perTxCap={req.per_tx_cap_eth} ETH, dailyCap={req.daily_cap_eth} ETH",
        req.tx_hash,
        31337,
        req.is_on_chain or 0,
        "PolicyUpdated"
    ))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "vault_address": req.vault_address,
        "per_tx_cap_eth": req.per_tx_cap_eth,
        "daily_cap_eth": req.daily_cap_eth,
        "message": "Policy successfully updated and persisted in SQLite database."
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "AgentVault Backend",
        "database": "SQLite connected",
        "timestamp": int(time.time()),
    }
