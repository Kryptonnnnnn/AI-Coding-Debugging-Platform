import time
from collections import defaultdict, deque

from app.core.errors import RateLimited


class RateLimiter:
    """In-memory sliding window. Per-process; use Redis for multi-instance deployments."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float = 60.0) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            raise RateLimited("Rate limit exceeded. Please retry shortly.")
        q.append(now)

    def reset(self) -> None:
        self._hits.clear()


limiter = RateLimiter()
