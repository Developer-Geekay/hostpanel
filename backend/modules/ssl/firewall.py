"""
Firewall rule manager — UFW or iptables backend.
All subprocess calls use shell=False.
"""
import logging
import subprocess

from .exceptions import FirewallError

logger = logging.getLogger(__name__)


def _run(cmd: list[str], action: str) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, shell=False)
    if result.returncode != 0:
        output = (result.stderr or result.stdout).strip()
        raise FirewallError(f"Firewall {action} failed ({' '.join(cmd)}):\n{output}")


# ── UFW ───────────────────────────────────────────────────────────────────────

def _ufw_open(port: int, proto: str = "tcp") -> None:
    _run(["sudo", "-n", "ufw", "allow", f"{port}/{proto}"], f"open port {port}")
    logger.info(f"UFW: opened port {port}/{proto}")


def _ufw_close(port: int, proto: str = "tcp") -> None:
    _run(["sudo", "-n", "ufw", "delete", "allow", f"{port}/{proto}"], f"close port {port}")
    logger.info(f"UFW: closed port {port}/{proto}")


def _ufw_check(port: int, proto: str = "tcp") -> bool:
    result = subprocess.run(
        ["sudo", "-n", "ufw", "status", "numbered"],
        capture_output=True, text=True, shell=False,
    )
    return f"{port}/{proto}" in result.stdout or f"{port} " in result.stdout


# ── iptables ──────────────────────────────────────────────────────────────────

def _iptables_open(port: int, proto: str = "tcp") -> None:
    _run(
        ["sudo", "-n", "iptables", "-A", "INPUT", "-p", proto,
         "--dport", str(port), "-j", "ACCEPT"],
        f"open port {port}",
    )
    logger.info(f"iptables: opened port {port}/{proto}")


def _iptables_close(port: int, proto: str = "tcp") -> None:
    _run(
        ["sudo", "-n", "iptables", "-D", "INPUT", "-p", proto,
         "--dport", str(port), "-j", "ACCEPT"],
        f"close port {port}",
    )
    logger.info(f"iptables: closed port {port}/{proto}")


def _iptables_check(port: int, proto: str = "tcp") -> bool:
    result = subprocess.run(
        ["sudo", "-n", "iptables", "-C", "INPUT", "-p", proto,
         "--dport", str(port), "-j", "ACCEPT"],
        capture_output=True, text=True, shell=False,
    )
    return result.returncode == 0


# ── Public API ────────────────────────────────────────────────────────────────

def firewall_open_port(port: int, backend: str = "ufw", proto: str = "tcp") -> None:
    """Open port in the firewall. Skips silently if already open."""
    if backend == "none":
        logger.debug(f"Firewall backend is 'none' — skipping open for port {port}")
        return
    if firewall_check_port_open(port, backend, proto):
        logger.debug(f"Port {port}/{proto} already open in {backend} — skipping.")
        return
    if backend == "ufw":
        _ufw_open(port, proto)
    elif backend == "iptables":
        _iptables_open(port, proto)
    else:
        raise FirewallError(f"Unknown firewall backend: {backend!r}. Use 'ufw', 'iptables', or 'none'.")


def firewall_close_port(port: int, backend: str = "ufw", proto: str = "tcp") -> None:
    """Close/remove port rule from the firewall."""
    if backend == "none":
        logger.debug(f"Firewall backend is 'none' — skipping close for port {port}")
        return
    if backend == "ufw":
        _ufw_close(port, proto)
    elif backend == "iptables":
        _iptables_close(port, proto)
    else:
        raise FirewallError(f"Unknown firewall backend: {backend!r}.")


def firewall_check_port_open(port: int, backend: str = "ufw", proto: str = "tcp") -> bool:
    """Return True if port rule exists, False otherwise. Never raises."""
    try:
        if backend == "ufw":
            return _ufw_check(port, proto)
        if backend == "iptables":
            return _iptables_check(port, proto)
        return False
    except Exception as e:
        logger.warning(f"Could not check firewall status for port {port}: {e}")
        return False
