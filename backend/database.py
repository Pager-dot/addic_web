import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

pool = None

async def get_pool():
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"), min_size=2, max_size=10)
    return pool

async def init_db():
    p = await get_pool()
    with open("schema.sql") as f:
        await p.execute(f.read())
