from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date
from database import get_pool
from dependencies import get_current_user

router = APIRouter()


class JournalEntry(BaseModel):
    body: Optional[str] = Field(None, max_length=5000)
    is_clean: bool = False
    visibility: str = "private"  # 'private' | 'connections'

    def validate_visibility(self):
        if self.visibility not in ("private", "connections"):
            raise ValueError("visibility must be 'private' or 'connections'")


@router.get("/today")
async def get_today(user_id: str = Depends(get_current_user)):
    today = date.today()  # asyncpg requires date object, not string
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, entry_date, body, is_clean, visibility, updated_at FROM journal_entries WHERE user_id = $1 AND entry_date = $2",
            user_id, today,
        )
    if not row:
        return {"entry_date": today.isoformat(), "body": None, "is_clean": False, "visibility": "private", "exists": False}
    return {**dict(row), "entry_date": row["entry_date"].isoformat(), "id": str(row["id"]), "exists": True}


@router.post("/", status_code=201)
async def create_or_update_entry(body: JournalEntry, user_id: str = Depends(get_current_user)):
    if body.visibility not in ("private", "connections"):
        raise HTTPException(status_code=400, detail="visibility must be 'private' or 'connections'")
    today = date.today()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO journal_entries (user_id, entry_date, body, is_clean, visibility)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, entry_date)
            DO UPDATE SET body = EXCLUDED.body, is_clean = EXCLUDED.is_clean,
                          visibility = EXCLUDED.visibility, updated_at = NOW()
            RETURNING id, entry_date, body, is_clean, visibility, updated_at
            """,
            user_id, today, body.body, body.is_clean, body.visibility,
        )
    return {**dict(row), "entry_date": row["entry_date"].isoformat(), "id": str(row["id"])}


@router.put("/{entry_date}")
async def update_entry(entry_date: str, body: JournalEntry, user_id: str = Depends(get_current_user)):
    if body.visibility not in ("private", "connections"):
        raise HTTPException(status_code=400, detail="visibility must be 'private' or 'connections'")
    try:
        parsed_date = date.fromisoformat(entry_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO journal_entries (user_id, entry_date, body, is_clean, visibility)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, entry_date)
            DO UPDATE SET body = EXCLUDED.body, is_clean = EXCLUDED.is_clean,
                          visibility = EXCLUDED.visibility, updated_at = NOW()
            RETURNING id, entry_date, body, is_clean, visibility, updated_at
            """,
            user_id, parsed_date, body.body, body.is_clean, body.visibility,
        )
    return {**dict(row), "entry_date": row["entry_date"].isoformat(), "id": str(row["id"])}


@router.get("/")
async def list_entries(user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, entry_date, body, is_clean, visibility, updated_at
            FROM journal_entries
            WHERE user_id = $1
            ORDER BY entry_date DESC
            LIMIT 30
            """,
            user_id,
        )
    entries = [{**dict(r), "entry_date": r["entry_date"].isoformat(), "id": str(r["id"])} for r in rows]
    clean_count = sum(1 for e in entries if e["is_clean"])
    return {"entries": entries, "clean_days_last_30": clean_count}


@router.get("/feed")
async def connection_feed(user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT j.id, j.entry_date, j.body, j.is_clean, j.updated_at, u.username AS author_username
            FROM journal_entries j
            JOIN users u ON j.user_id = u.id
            WHERE j.visibility = 'connections'
              AND j.user_id IN (
                SELECT CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END
                FROM connections c
                WHERE (c.requester_id = $1 OR c.addressee_id = $1)
                  AND c.status = 'accepted'
              )
            ORDER BY j.updated_at DESC
            LIMIT 20
            """,
            user_id,
        )
    return [
        {**dict(r), "entry_date": r["entry_date"].isoformat(), "id": str(r["id"])}
        for r in rows
    ]
