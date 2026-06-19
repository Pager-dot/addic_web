import secrets
from fastapi import Request, HTTPException
from starlette.requests import HTTPConnection
from auth import verify_access_token


async def get_current_user(request: Request) -> str:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = verify_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    return user_id


async def verify_csrf(request: HTTPConnection):
    """Double-submit cookie CSRF check. Skips WebSocket, safe HTTP methods."""
    if request.scope["type"] == "websocket":
        return  # WebSocket auth is handled via one-time ticket
    method = request.scope.get("method", "")
    if method in ("GET", "HEAD", "OPTIONS"):
        return
    csrf_cookie = request.cookies.get("csrf_token")
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_cookie or not csrf_header:
        raise HTTPException(status_code=403, detail="CSRF token missing")
    if not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF token invalid")
