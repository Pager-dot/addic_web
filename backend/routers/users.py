from fastapi import APIRouter, Depends
from database import get_pool
from dependencies import get_current_user

router = APIRouter()

@router.get("/me/clubs")
async def my_clubs(user_id: str = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        clubs = await conn.fetch(
            """SELECT c.id, c.name, c.description, m.role
               FROM clubs c JOIN memberships m ON c.id = m.club_id
               WHERE m.user_id = $1 AND c.is_deleted = FALSE""",
            user_id
        )
    return [dict(c) for c in clubs]
