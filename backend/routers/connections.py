from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from database import get_pool
from dependencies import get_current_user

router = APIRouter()


@router.get("/search")
async def search_users(q: str = Query(min_length=1, max_length=30), user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                u.id,
                u.username,
                c.id        AS connection_id,
                c.status    AS connection_status,
                c.requester_id
            FROM users u
            LEFT JOIN connections c
                ON (c.requester_id = $2 AND c.addressee_id = u.id)
                OR (c.requester_id = u.id AND c.addressee_id = $2)
            WHERE u.username ILIKE $1
              AND u.id != $2
              AND u.is_deleted = FALSE
            LIMIT 10
            """,
            f"%{q}%", user_id,
        )
    result = []
    for r in rows:
        status = None
        if r["connection_status"] == "accepted":
            status = "connected"
        elif r["connection_status"] == "pending":
            status = "pending_sent" if str(r["requester_id"]) == user_id else "pending_received"
        result.append({
            "id": str(r["id"]),
            "username": r["username"],
            "status": status,
            "connection_id": str(r["connection_id"]) if r["connection_id"] else None,
        })
    return result


class ConnectionRequest(BaseModel):
    addressee_id: str


@router.post("/request", status_code=201)
async def send_request(body: ConnectionRequest, user_id: str = Depends(get_current_user)):
    if body.addressee_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot connect with yourself")
    pool = await get_pool()
    async with pool.acquire() as conn:
        target = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE", body.addressee_id,
        )
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        existing = await conn.fetchrow(
            """SELECT id, status FROM connections
               WHERE (requester_id = $1 AND addressee_id = $2)
                  OR (requester_id = $2 AND addressee_id = $1)""",
            user_id, body.addressee_id,
        )
        if existing:
            raise HTTPException(status_code=409, detail=f"Connection already exists (status: {existing['status']})")
        row = await conn.fetchrow(
            "INSERT INTO connections (requester_id, addressee_id) VALUES ($1, $2) RETURNING id",
            user_id, body.addressee_id,
        )
    return {"id": str(row["id"]), "status": "pending"}


@router.post("/{connection_id}/accept")
async def accept_request(connection_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, status FROM connections WHERE id = $1 AND addressee_id = $2",
            connection_id, user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Request not found or not addressed to you")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")
        await conn.execute(
            "UPDATE connections SET status = 'accepted' WHERE id = $1", connection_id,
        )
    return {"message": "Connection accepted"}


@router.post("/{connection_id}/reject")
async def reject_request(connection_id: str, user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id FROM connections
               WHERE id = $1
                 AND (addressee_id = $2 OR requester_id = $2)""",
            connection_id, user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        await conn.execute("DELETE FROM connections WHERE id = $1", connection_id)
    return {"message": "Connection removed"}


@router.get("/")
async def list_connections(user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                c.id,
                c.created_at,
                CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END AS friend_id,
                CASE WHEN c.requester_id = $1 THEN ua.username ELSE ur.username END AS friend_username
            FROM connections c
            JOIN users ur ON c.requester_id = ur.id
            JOIN users ua ON c.addressee_id = ua.id
            WHERE (c.requester_id = $1 OR c.addressee_id = $1)
              AND c.status = 'accepted'
            ORDER BY c.created_at DESC
            """,
            user_id,
        )
    return [{"id": str(r["id"]), "friend_id": str(r["friend_id"]), "friend_username": r["friend_username"], "connected_at": r["created_at"]} for r in rows]


@router.get("/pending")
async def pending_requests(user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.created_at, u.username AS requester_username, u.id AS requester_id
            FROM connections c
            JOIN users u ON c.requester_id = u.id
            WHERE c.addressee_id = $1 AND c.status = 'pending'
            ORDER BY c.created_at DESC
            """,
            user_id,
        )
    return [{"id": str(r["id"]), "requester_id": str(r["requester_id"]), "requester_username": r["requester_username"], "sent_at": r["created_at"]} for r in rows]
