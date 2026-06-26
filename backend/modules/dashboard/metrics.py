import psutil
import time
import os
import socket
import platform

_prev_net: psutil._common.snetio | None = None  # type: ignore[name-defined]
_prev_time: float | None = None

_SKIP_FSTYPES = {"tmpfs", "devtmpfs", "squashfs", "overlay", "ramfs", "sysfs", "proc", "cgroup", "cgroup2", "none"}
_SKIP_MOUNTS = {"/boot", "/boot/firmware", "/boot/efi"}


def _get_disks() -> list[dict]:
    seen: set[str] = set()
    disks = []
    for part in psutil.disk_partitions(all=False):
        if part.fstype in _SKIP_FSTYPES:
            continue
        if part.device.startswith("/dev/loop"):
            continue
        if part.mountpoint in _SKIP_MOUNTS or part.mountpoint.startswith("/boot"):
            continue
        if part.device in seen:
            continue
        seen.add(part.device)
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue
        disks.append({
            "mountpoint": part.mountpoint,
            "device":     part.device,
            "total":      usage.total,
            "used":       usage.used,
            "free":       usage.free,
            "percent":    round(usage.percent, 1),
        })
    return disks


def get_stats() -> dict:
    """Return CPU, memory, disk partitions, network stats, and general system info."""
    global _prev_net, _prev_time

    cpu  = psutil.cpu_percent(interval=None)
    mem  = psutil.virtual_memory()
    net  = psutil.net_io_counters()
    now  = time.monotonic()

    if _prev_net is not None and _prev_time is not None:
        dt = max(now - _prev_time, 0.001)
        bytes_sent_rate = max((net.bytes_sent - _prev_net.bytes_sent) / dt, 0)
        bytes_recv_rate = max((net.bytes_recv - _prev_net.bytes_recv) / dt, 0)
    else:
        bytes_sent_rate = 0.0
        bytes_recv_rate = 0.0

    _prev_net  = net
    _prev_time = now

    # Load avg
    try:
        load = os.getloadavg()
    except (AttributeError, OSError):
        load = (0.0, 0.0, 0.0)

    # Uptime
    try:
        boot_time = psutil.boot_time()
        uptime = time.time() - boot_time
    except Exception:
        uptime = 0.0

    # Hostname
    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = "localhost"

    # OS pretty name
    os_name = "Linux"
    if os.path.exists("/etc/os-release"):
        try:
            with open("/etc/os-release") as f:
                for line in f:
                    if line.startswith("PRETTY_NAME="):
                        os_name = line.split("=")[1].strip().strip('"')
                        break
        except Exception:
            pass
    else:
        os_name = f"{platform.system()} {platform.release()}"

    return {
        "cpu": round(cpu, 1),
        "memory": {
            "total":     mem.total,
            "available": mem.available,
            "percent":   round(mem.percent, 1),
        },
        "disks": _get_disks(),
        "network": {
            "bytes_sent": round(bytes_sent_rate),
            "bytes_recv": round(bytes_recv_rate),
        },
        "uptime": round(uptime),
        "load_avg": [round(x, 2) for x in load],
        "hostname": hostname,
        "os": os_name,
        "kernel": platform.release(),
    }

