import psutil


def get_stats() -> dict:
    """Return CPU, memory, and disk stats. Blocking — run in executor if on async path."""
    cpu   = psutil.cpu_percent(interval=None)
    mem   = psutil.virtual_memory()
    disk  = psutil.disk_usage('/')
    return {
        "cpu": round(cpu, 1),
        "memory": {
            "total":     mem.total,
            "available": mem.available,
            "percent":   round(mem.percent, 1),
        },
        "disk": {
            "total":   disk.total,
            "used":    disk.used,
            "free":    disk.free,
            "percent": round(disk.percent, 1),
        },
    }
