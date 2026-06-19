import secrets
from datetime import datetime, timedelta, timezone

_tickets: dict[str, dict] = {}


def create_ticket(user_id: str) -> str:
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = {
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=30),
    }
    return ticket


def consume_ticket(ticket: str) -> str | None:
    """Pop and return user_id if ticket exists and is not expired, else None."""
    data = _tickets.pop(ticket, None)
    if not data:
        return None
    if data["expires_at"] < datetime.now(timezone.utc):
        return None
    return data["user_id"]
