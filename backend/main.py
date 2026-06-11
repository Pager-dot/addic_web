from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel, EmailStr, Field
import os
from dotenv import load_dotenv

from database import get_pool
from auth import create_magic_token, verify_magic_token, create_session_token, send_magic_link
from dependencies import get_current_user
from routers import users, clubs, posts

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield

app = FastAPI(title="Recovery Community API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api/users")
app.include_router(clubs.router, prefix="/api/clubs")
app.include_router(posts.router, prefix="/api/posts")


class MagicLinkRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30)

@app.post("/api/auth/request")
async def request_magic_link(body: MagicLinkRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
        if not user:
            await conn.execute(
                "INSERT INTO users (email, username) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                body.email, body.username
            )
    token = create_magic_token(body.email)
    send_magic_link(body.email, token, os.getenv("FRONTEND_URL", "http://localhost:5173"))
    return {"message": "Magic link sent. Check your email."}


class VerifyRequest(BaseModel):
    token: str

@app.post("/api/auth/verify")
async def verify_magic_link(body: VerifyRequest, response: Response):
    email = verify_magic_token(body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    session_token = create_session_token(str(user["id"]))
    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 7
    )
    return {"message": "Logged in", "user_id": str(user["id"])}


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"message": "Logged out"}


@app.get("/api/auth/me")
async def me(request: Request, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, username, email, created_at FROM users WHERE id = $1", user_id
        )
    return dict(user)


@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}
