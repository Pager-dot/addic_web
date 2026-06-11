import os
import jwt
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 15))
REFRESH_TOKEN_EXPIRE_MINUTES = 30

ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)


# --- Password ---

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False

def needs_rehash(hashed: str) -> bool:
    return ph.check_needs_rehash(hashed)


# --- JWTs ---

def _make_jwt(payload: dict, expire_delta: timedelta) -> str:
    payload["exp"] = datetime.now(timezone.utc) + expire_delta
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def _decode_jwt(token: str, expected_type: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != expected_type:
            return None
        return payload.get("sub")
    except Exception:
        return None

def create_access_token(user_id: str) -> str:
    return _make_jwt({"sub": user_id, "type": "access"}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

def verify_access_token(token: str) -> str | None:
    return _decode_jwt(token, "access")

def create_magic_token(email: str) -> str:
    return _make_jwt({"sub": email, "type": "magic"}, timedelta(minutes=15))

def verify_magic_token(token: str) -> str | None:
    return _decode_jwt(token, "magic")

def create_email_verification_token(email: str) -> str:
    return _make_jwt({"sub": email, "type": "email_verify"}, timedelta(hours=24))

def verify_email_verification_token(token: str) -> str | None:
    return _decode_jwt(token, "email_verify")

def create_password_reset_token(email: str) -> str:
    return _make_jwt({"sub": email, "type": "pwd_reset"}, timedelta(minutes=15))

def verify_password_reset_token(token: str) -> str | None:
    return _decode_jwt(token, "pwd_reset")


# --- Refresh token (random, stored as hash) ---

def generate_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash). Store only the hash."""
    raw = secrets.token_urlsafe(48)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed

def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# --- CSRF ---

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


# --- Email sending ---

def _try_send_email(to: str, subject: str, html: str):
    resend_key = os.getenv("RESEND_API_KEY", "")
    if resend_key and resend_key != "your-resend-api-key":
        try:
            import resend as _resend
            _resend.api_key = resend_key
            _resend.Emails.send({
                "from": "noreply@yourdomain.com",
                "to": to,
                "subject": subject,
                "html": html,
            })
        except Exception as e:
            print(f"[email] send failed (non-fatal): {e}")

def send_magic_link(email: str, token: str, frontend_url: str):
    link = f"{frontend_url}/verify?token={token}"
    print(f"\n===== MAGIC LINK =====\nTo: {email}\n{link}\n======================\n")
    _try_send_email(email, "Your login link",
        f"<p>Click to log in: <a href='{link}'>{link}</a></p><p>Expires in 15 minutes.</p>")

def send_verification_email(email: str, token: str, frontend_url: str):
    link = f"{frontend_url}/verify-email?token={token}"
    print(f"\n===== EMAIL VERIFICATION =====\nTo: {email}\n{link}\n==============================\n")
    _try_send_email(email, "Verify your email",
        f"<p>Verify your account: <a href='{link}'>{link}</a></p><p>Expires in 24 hours.</p>")

def send_password_reset_email(email: str, token: str, frontend_url: str):
    link = f"{frontend_url}/reset-password?token={token}"
    print(f"\n===== PASSWORD RESET =====\nTo: {email}\n{link}\n==========================\n")
    _try_send_email(email, "Reset your password",
        f"<p>Reset your password: <a href='{link}'>{link}</a></p><p>Expires in 15 minutes.</p>")
