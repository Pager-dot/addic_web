from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from database import get_pool
from dependencies import get_current_user

router = APIRouter()

class CreatePost(BaseModel):
    club_id: str
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=10000)
    content_warning: Optional[str] = Field(None, max_length=100)

@router.post("/")
async def create_post(body: CreatePost, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        member = await conn.fetchrow(
            "SELECT id FROM memberships WHERE user_id = $1 AND club_id = $2",
            user_id, body.club_id
        )
        if not member:
            raise HTTPException(status_code=403, detail="Join the club to post")
        post = await conn.fetchrow(
            "INSERT INTO posts (club_id, author_id, title, body, content_warning) VALUES ($1, $2, $3, $4, $5) RETURNING id, title",
            body.club_id, user_id, body.title, body.body, body.content_warning
        )
    return dict(post)

@router.get("/{post_id}")
async def get_post(post_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        post = await conn.fetchrow(
            """SELECT p.id, p.title, p.body, p.content_warning, p.created_at, u.username as author
               FROM posts p JOIN users u ON p.author_id = u.id
               WHERE p.id = $1 AND p.is_deleted = FALSE""",
            post_id
        )
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        comments = await conn.fetch(
            """SELECT c.id, c.body, c.created_at, u.username as author
               FROM comments c JOIN users u ON c.author_id = u.id
               WHERE c.post_id = $1 AND c.is_deleted = FALSE
               ORDER BY c.created_at ASC""",
            post_id
        )
    return {**dict(post), "comments": [dict(c) for c in comments]}

class CreateComment(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

@router.post("/{post_id}/comments")
async def add_comment(post_id: str, body: CreateComment, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        post = await conn.fetchrow("SELECT club_id FROM posts WHERE id = $1", post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        member = await conn.fetchrow(
            "SELECT id FROM memberships WHERE user_id = $1 AND club_id = $2",
            user_id, str(post["club_id"])
        )
        if not member:
            raise HTTPException(status_code=403, detail="Join the club to comment")
        comment = await conn.fetchrow(
            "INSERT INTO comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id",
            post_id, user_id, body.body
        )
    return dict(comment)
