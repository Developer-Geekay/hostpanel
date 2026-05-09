import psutil
import logging
from fastapi import APIRouter, Depends, HTTPException

from deps import require_admin
from auth import User

router = APIRouter(prefix="/cpanelapi", tags=["Dashboard"])
logger = logging.getLogger(__name__)

@router.get("/system/stats")
async def get_system_stats(current_user: User = Depends(require_admin)):
    """Get basic system statistics (CPU, RAM, Disk)."""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            "cpu": cpu_percent,
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent
            }
        }
    except Exception as e:
        logger.error(f"Failed to get system stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve system statistics")
