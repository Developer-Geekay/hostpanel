import asyncio
import logging
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from auth import decode_access_token
from deps import require_admin
from portal_users import get_user as get_portal_user
from modules.dashboard.metrics import get_stats
from modules.dashboard.ws_manager import manager, ensure_loop_running

router = APIRouter(prefix="/cpanelapi", tags=["Dashboard"])
_log = logging.getLogger(__name__)


@router.get("/system/stats")
async def system_stats_snapshot(_=Depends(require_admin)):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_stats)


@router.websocket("/system/stats/ws")
async def system_stats_ws(ws: WebSocket, token: str = Query(...)):
    token_data = decode_access_token(token)
    if token_data is None or token_data.role != "admin":
        await ws.close(code=1008)
        return
    user = get_portal_user(token_data.username)
    if user is None or user.disabled:
        await ws.close(code=1008)
        return

    await manager.connect(ws)
    ensure_loop_running()

    try:
        loop = asyncio.get_event_loop()
        initial = await loop.run_in_executor(None, get_stats)
        await ws.send_json(initial)
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        _log.debug("stats_ws closed: %s", exc)
    finally:
        manager.disconnect(ws)
