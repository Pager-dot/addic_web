from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from database import get_pool
from dependencies import get_current_user
from ws_tickets import consume_ticket

router = APIRouter()


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, club_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(club_id, set()).add(ws)

    def disconnect(self, club_id: str, ws: WebSocket):
        self.rooms.get(club_id, set()).discard(ws)

    async def broadcast(self, club_id: str, payload: dict):
        for ws in list(self.rooms.get(club_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.rooms[club_id].discard(ws)


manager = ConnectionManager()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_msg(r) -> dict:
    return {
        "id": str(r["id"]),
        "author": r["author"],
        "author_id": str(r["author_id"]),
        "body": r["body"],
        "created_at": r["created_at"].isoformat(),
    }


# ── HTTP endpoints ────────────────────────────────────────────────────────────

@router.get("/search")
async def search_clubs(q: str = Query(min_length=1, max_length=60), user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.name, c.description, c.created_at,
                   COUNT(m.id) AS member_count
            FROM clubs c
            LEFT JOIN memberships m ON c.id = m.club_id
            WHERE c.name ILIKE $1 AND c.is_deleted = FALSE
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT 20
            """,
            f"%{q}%",
        )
    return [dict(r) for r in rows]


@router.get("/")
async def list_clubs():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.name, c.description, c.created_at,
                   COUNT(m.id) AS member_count
            FROM clubs c
            LEFT JOIN memberships m ON c.id = m.club_id
            WHERE c.is_deleted = FALSE
            GROUP BY c.id
            ORDER BY c.created_at DESC
            """
        )
    return [dict(r) for r in rows]


class CreateClub(BaseModel):
    name: str = Field(min_length=3, max_length=60)
    description: str = Field(default="", max_length=500)


@router.post("/", status_code=201)
async def create_club(body: CreateClub, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        club = await conn.fetchrow(
            "INSERT INTO clubs (name, description, created_by) VALUES ($1, $2, $3) RETURNING id, name",
            body.name, body.description, user_id,
        )
        await conn.execute(
            "INSERT INTO memberships (user_id, club_id, role) VALUES ($1, $2, 'moderator')",
            user_id, str(club["id"]),
        )
    return dict(club)


@router.post("/{club_id}/join")
async def join_club(club_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        club = await conn.fetchrow("SELECT id FROM clubs WHERE id = $1 AND is_deleted = FALSE", club_id)
        if not club:
            raise HTTPException(status_code=404, detail="Club not found")
        await conn.execute(
            "INSERT INTO memberships (user_id, club_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            user_id, club_id,
        )
    return {"message": "Joined"}


@router.get("/{club_id}")
async def get_club(club_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        club = await conn.fetchrow(
            "SELECT id, name, description, created_at FROM clubs WHERE id = $1 AND is_deleted = FALSE",
            club_id,
        )
        if not club:
            raise HTTPException(status_code=404, detail="Club not found")

        membership = await conn.fetchrow(
            "SELECT role FROM memberships WHERE user_id = $1 AND club_id = $2",
            user_id, club_id,
        )
        member_count = await conn.fetchval(
            "SELECT COUNT(*) FROM memberships WHERE club_id = $1", club_id,
        )

        is_member = membership is not None
        is_moderator = membership is not None and membership["role"] == "moderator"

        messages = []
        if is_member:
            rows = await conn.fetch(
                """
                SELECT msg.id, msg.body, msg.created_at, u.username AS author, msg.author_id
                FROM messages msg
                JOIN users u ON msg.author_id = u.id
                WHERE msg.club_id = $1 AND msg.is_deleted = FALSE
                ORDER BY msg.created_at DESC
                LIMIT 50
                """,
                club_id,
            )
            messages = [_fmt_msg(r) for r in reversed(rows)]

    return {
        **dict(club),
        "member_count": member_count,
        "is_member": is_member,
        "is_moderator": is_moderator,
        "messages": messages,
    }


@router.get("/{club_id}/messages")
async def load_earlier(
    club_id: str,
    before: str = Query(..., description="UUID of oldest currently loaded message"),
    user_id: str = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        member = await conn.fetchrow(
            "SELECT id FROM memberships WHERE user_id = $1 AND club_id = $2", user_id, club_id,
        )
        if not member:
            raise HTTPException(status_code=403, detail="Members only")

        cursor_time = await conn.fetchval(
            "SELECT created_at FROM messages WHERE id = $1", before,
        )
        if not cursor_time:
            raise HTTPException(status_code=404, detail="Cursor message not found")

        rows = await conn.fetch(
            """
            SELECT msg.id, msg.body, msg.created_at, u.username AS author, msg.author_id
            FROM messages msg
            JOIN users u ON msg.author_id = u.id
            WHERE msg.club_id = $1 AND msg.is_deleted = FALSE AND msg.created_at < $2
            ORDER BY msg.created_at DESC
            LIMIT 50
            """,
            club_id, cursor_time,
        )
    return [_fmt_msg(r) for r in reversed(rows)]


@router.delete("/{club_id}", status_code=204)
async def delete_club(club_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        role = await conn.fetchval(
            "SELECT role FROM memberships WHERE user_id = $1 AND club_id = $2",
            user_id, club_id,
        )
        if role != "moderator":
            raise HTTPException(status_code=403, detail="Only the moderator can delete this club")
        result = await conn.execute(
            "UPDATE clubs SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE", club_id,
        )
        if result == "UPDATE 0":
            raise HTTPException(status_code=404, detail="Club not found")


# ── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/{club_id}/ws")
async def club_ws(club_id: str, ws: WebSocket, ticket: str = Query(...)):
    user_id = consume_ticket(ticket)
    if not user_id:
        await ws.close(code=4001)
        return

    pool = await get_pool()
    async with pool.acquire() as conn:
        member = await conn.fetchrow(
            "SELECT id FROM memberships WHERE user_id = $1 AND club_id = $2",
            user_id, club_id,
        )
        if not member:
            await ws.close(code=4003)
            return
        username = await conn.fetchval("SELECT username FROM users WHERE id = $1", user_id)

    await manager.connect(club_id, ws)
    try:
        while True:
            text = await ws.receive_text()
            body = text.strip()[:1000]
            if not body:
                continue
            async with pool.acquire() as conn:
                msg = await conn.fetchrow(
                    "INSERT INTO messages (club_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
                    club_id, user_id, body,
                )
            await manager.broadcast(club_id, {
                "id": str(msg["id"]),
                "author": username,
                "author_id": user_id,
                "body": body,
                "created_at": msg["created_at"].isoformat(),
            })
    except WebSocketDisconnect:
        manager.disconnect(club_id, ws)
