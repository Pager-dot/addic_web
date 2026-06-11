from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import get_pool
from auth import (
    hash_password, verify_password, needs_rehash,
    create_access_token,
    create_magic_token, verify_magic_token,
    create_email_verification_token, verify_email_verification_token,
    create_password_reset_token, verify_password_reset_token,
    generate_refresh_token, hash_refresh_token,
    generate_csrf_token,
    send_magic_link, send_verification_email, send_password_reset_email,
)
from dependencies import get_current_user, verify_csrf
from routers import users, clubs, posts

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
REFRESH_EXPIRE_MINUTES = 30

limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield


app = FastAPI(title="Recovery Community API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-CSRF-Token"],
)

# CSRF protection applied to all club/post mutations
app.include_router(users.router, prefix="/api/users")
app.include_router(clubs.router, prefix="/api/clubs", dependencies=[Depends(verify_csrf)])
app.include_router(posts.router, prefix="/api/posts", dependencies=[Depends(verify_csrf)])


# --- Cookie helpers ---

def _is_prod() -> bool:
    return os.getenv("ENV", "dev") == "production"

def _set_auth_cookies(response: Response, access_token: str, raw_refresh: str, csrf_token: str):
    prod = _is_prod()
    response.set_cookie(
        key="access_token", value=access_token,
        httponly=True, secure=prod, samesite="strict",
        max_age=60 * 15, path="/",
    )
    # Refresh token restricted to /api/auth so it isn't sent on every request
    response.set_cookie(
        key="refresh_token", value=raw_refresh,
        httponly=True, secure=prod, samesite="strict",
        max_age=60 * REFRESH_EXPIRE_MINUTES, path="/api/auth",
    )
    # CSRF cookie is readable by JS (not httpOnly) so the SPA can send it in a header
    response.set_cookie(
        key="csrf_token", value=csrf_token,
        httponly=False, secure=prod, samesite="strict",
        max_age=60 * REFRESH_EXPIRE_MINUTES, path="/",
    )

def _clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("csrf_token", path="/")


# --- Token issuance helper ---

async def _issue_tokens(conn, user_id: str, response: Response) -> dict:
    access_token = create_access_token(user_id)
    raw_refresh, refresh_hash = generate_refresh_token()
    csrf_token = generate_csrf_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=REFRESH_EXPIRE_MINUTES)
    await conn.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id, refresh_hash, expires_at,
    )
    _set_auth_cookies(response, access_token, raw_refresh, csrf_token)
    return {"csrf_token": csrf_token}


# ============================================================
# AUTH ROUTES
# ============================================================

# --- Register (email + password) ---

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=128)

@app.post("/api/auth/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1 OR username = $2",
            body.email, body.username,
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email or username already taken")
        pw_hash = hash_password(body.password)
        await conn.execute(
            "INSERT INTO users (email, username, password_hash, email_verified) VALUES ($1, $2, $3, FALSE)",
            body.email, body.username, pw_hash,
        )
    token = create_email_verification_token(body.email)
    send_verification_email(body.email, token, FRONTEND_URL)
    return {"message": "Account created. Check your email to verify before logging in."}


# --- Login (email + password) ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, response: Response):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, password_hash, email_verified FROM users WHERE email = $1 AND is_deleted = FALSE",
            body.email,
        )
        # Constant-time: always run verify_password to prevent timing attacks
        dummy_hash = "$argon2id$v=19$m=65536,t=2,p=2$dummydummydummy$dummydummydummydummydummydummydummy"
        stored_hash = user["password_hash"] if (user and user["password_hash"]) else dummy_hash
        if not verify_password(body.password, stored_hash) or not user or not user["password_hash"]:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user["email_verified"]:
            raise HTTPException(status_code=403, detail="Please verify your email before logging in")
        if needs_rehash(user["password_hash"]):
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                hash_password(body.password), str(user["id"]),
            )
        result = await _issue_tokens(conn, str(user["id"]), response)
    return {"message": "Logged in", **result}


# --- Email verification ---

class VerifyEmailRequest(BaseModel):
    token: str

@app.post("/api/auth/verify-email")
async def verify_email(body: VerifyEmailRequest):
    email = verify_email_verification_token(body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE users SET email_verified = TRUE WHERE email = $1 AND is_deleted = FALSE",
            email,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Email verified. You can now log in."}


# --- Magic link ---

class MagicLinkRequest(BaseModel):
    email: EmailStr
    username: Optional[str] = Field(None, min_length=3, max_length=30)

@app.post("/api/auth/magic-link/request")
@limiter.limit("5/minute")
async def request_magic_link(request: Request, body: MagicLinkRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
        if not user:
            if not body.username:
                raise HTTPException(status_code=400, detail="Username required for new accounts")
            await conn.execute(
                "INSERT INTO users (email, username, email_verified) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING",
                body.email, body.username,
            )
    token = create_magic_token(body.email)
    send_magic_link(body.email, token, FRONTEND_URL)
    return {"message": "Magic link sent. Check your email."}

class MagicLinkVerifyRequest(BaseModel):
    token: str

@app.post("/api/auth/magic-link/verify")
async def verify_magic_link(body: MagicLinkVerifyRequest, response: Response):
    email = verify_magic_token(body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE", email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute("UPDATE users SET email_verified = TRUE WHERE id = $1", str(user["id"]))
        result = await _issue_tokens(conn, str(user["id"]), response)
    return {"message": "Logged in", **result}


# --- Token refresh (with rotation) ---

@app.post("/api/auth/refresh")
async def refresh_tokens(request: Request, response: Response):
    raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")
    token_hash = hash_refresh_token(raw_refresh)
    pool = await get_pool()
    async with pool.acquire() as conn:
        record = await conn.fetchrow(
            "SELECT id, user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1",
            token_hash,
        )
        if not record or record["revoked"]:
            _clear_auth_cookies(response)
            raise HTTPException(status_code=401, detail="Invalid or revoked refresh token")
        if record["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            _clear_auth_cookies(response)
            raise HTTPException(status_code=401, detail="Refresh token expired")
        # Rotate: revoke old token, issue new pair
        await conn.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", record["id"])
        result = await _issue_tokens(conn, str(record["user_id"]), response)
    return {"message": "Tokens refreshed", **result}


# --- Logout ---

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        token_hash = hash_refresh_token(raw_refresh)
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1", token_hash,
            )
    _clear_auth_cookies(response)
    return {"message": "Logged out"}

@app.post("/api/auth/logout-all")
async def logout_all(request: Request, response: Response, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", user_id,
        )
    _clear_auth_cookies(response)
    return {"message": "All sessions revoked"}


# --- Forgot / reset password ---

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

@app.post("/api/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE AND password_hash IS NOT NULL",
            body.email,
        )
    if user:
        token = create_password_reset_token(body.email)
        send_password_reset_email(body.email, token, FRONTEND_URL)
    # Always 200 — don't leak whether email exists
    return {"message": "If that email exists, a reset link has been sent."}

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

@app.post("/api/auth/reset-password")
async def reset_password(body: ResetPasswordRequest, response: Response):
    email = verify_password_reset_token(body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    pw_hash = hash_password(body.new_password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE users SET password_hash = $1 WHERE email = $2 AND is_deleted = FALSE",
            pw_hash, email,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="User not found")
        # Force re-login everywhere after password change
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        await conn.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1", str(user["id"]))
    _clear_auth_cookies(response)
    return {"message": "Password reset. Please log in with your new password."}


# --- Me ---

@app.get("/api/auth/me")
async def me(request: Request, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, username, email, created_at, email_verified FROM users WHERE id = $1", user_id,
        )
    return dict(user)


# --- Health ---

@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}
