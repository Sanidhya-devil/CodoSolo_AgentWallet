"""
AgentVault Authentication Utilities
Password hashing with bcrypt and JWT session token issuance.
"""

import os
import secrets
import time
from typing import Optional, Dict, Any
import bcrypt
import jwt

# P1 FIX (Issue 8): Generate high-entropy persistent secret if not provided in environment
DEFAULT_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".jwt_secret")

def get_jwt_secret() -> str:
    env_secret = os.environ.get("AGENTVAULT_JWT_SECRET")
    if env_secret and len(env_secret) >= 32:
        return env_secret
    if os.path.exists(DEFAULT_KEY_FILE):
        with open(DEFAULT_KEY_FILE, "r") as f:
            return f.read().strip()
    generated = secrets.token_hex(32)
    with open(DEFAULT_KEY_FILE, "w") as f:
        f.write(generated)
    return generated

JWT_SECRET = get_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_SECONDS = 7 * 24 * 3600  # 7 days


def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with salt."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: int, email: str, role: str) -> str:
    """Generates a signed JWT access token for user sessions."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRATION_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None
