from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from database import get_pool
from dependencies import get_current_user

router = APIRouter()

class CreateClub(BaseModel):
    name: str = Field(min_length=3, max_length=60)
    description: str = Field(max_length=500)
    is_private: bool = False

@router.get("/")
async def list_clubs():
    pool = await get_pool()
    async with pool.acquire() as conn:
        clubs = await conn.fetch(
            "SELECT id, name, description, is_private, created_at FROM clubs WHERE is_deleted = FALSE ORDER BY created_at DESC"
        )
    return [dict(c) for c in clubs]

@router.post("/")
async def create_club(body: CreateClub, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        club = await conn.fetchrow(
            "INSERT INTO clubs (name, description, is_private, created_by) VALUES ($1, $2, $3, $4) RETURNING id, name",
            body.name, body.description, body.is_private, user_id
        )
        await conn.execute(
            "INSERT INTO memberships (user_id, club_id, role) VALUES ($1, $2, 'moderator')",
            user_id, str(club["id"])
        )
    return dict(club)

@router.post("/{club_id}/join")
async def join_club(club_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO memberships (user_id, club_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            user_id, club_id
        )
    return {"message": "Joined"}

@router.get("/{club_id}")
async def get_club(club_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        club = await conn.fetchrow(
            "SELECT id, name, description, is_private, created_at FROM clubs WHERE id = $1 AND is_deleted = FALSE",
            club_id
        )
        if not club:
            raise HTTPException(status_code=404, detail="Club not found")
        posts = await conn.fetch(
            """SELECT p.id, p.title, p.content_warning, p.created_at, u.username as author
               FROM posts p JOIN users u ON p.author_id = u.id
               WHERE p.club_id = $1 AND p.is_deleted = FALSE
               ORDER BY p.created_at DESC LIMIT 20""",
            club_id
        )
    return {**dict(club), "posts": [dict(p) for p in posts]}
