import asyncio
import logging
from fastapi import WebSocket

from modules.dashboard.metrics import get_stats

_log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    @property
    def active(self) -> int:
        return len(self._clients)

    async def _broadcast(self, data: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in self._clients:
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self._clients -= dead


manager = ConnectionManager()
_loop_task: asyncio.Task | None = None


async def _metrics_loop() -> None:
    loop = asyncio.get_event_loop()
    while True:
        await asyncio.sleep(2)
        if manager.active:
            try:
                stats = await loop.run_in_executor(None, get_stats)
                await manager._broadcast(stats)
            except Exception as exc:
                _log.error("metrics broadcast error: %s", exc)


def ensure_loop_running() -> None:
    global _loop_task
    if _loop_task is None or _loop_task.done():
        _loop_task = asyncio.create_task(_metrics_loop())
