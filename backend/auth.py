import os
import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 15))

def create_magic_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": email, "exp": expire, "type": "magic"}, JWT_SECRET, algorithm="HS256")

def verify_magic_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "magic":
            return None
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def create_session_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=7)
    return jwt.encode({"sub": user_id, "exp": expire, "type": "session"}, JWT_SECRET, algorithm="HS256")

def verify_session_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "session":
            return None
        return payload.get("sub")
    except Exception:
        return None

def send_magic_link(email: str, token: str, frontend_url: str):
    link = f"{frontend_url}/verify?token={token}"
    # Always print to console for local dev
    print(f"\n========== MAGIC LINK ==========")
    print(f"To: {email}")
    print(f"Link: {link}")
    print(f"================================\n")
    # Attempt real email send if API key is configured
    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key and resend_key != "your-resend-api-key":
        try:
            import resend
            resend.api_key = resend_key
            resend.Emails.send({
                "from": "noreply@yourdomain.com",
                "to": email,
                "subject": "Your login link",
                "html": f"<p>Click to log in: <a href='{link}'>{link}</a></p><p>Expires in {JWT_EXPIRE_MINUTES} minutes.</p>"
            })
        except Exception as e:
            print(f"Email send failed (non-fatal): {e}")
