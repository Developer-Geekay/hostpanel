"""
Privilege demotion — run operations *as* the owning tenant Linux user.

The panel process must never touch a tenant's files as root and rely on a Python
path check to stay in-bounds. `run_as()` drops to the tenant account via
`sudo -u <user>`, so the kernel enforces isolation. Files created for a tenant are
then natively owned by that tenant, with no post-hoc chown.

Requires a sudoers grant permitting the panel service account to run the specific
tenant commands as another user (installed by install.sh).
"""
import logging
import os
import re
import subprocess
from typing import Optional, Sequence

_log = logging.getLogger(__name__)

# Linux usernames: start with a letter/underscore, then letters/digits/_/-, max 32.
_VALID_USER = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")


def panel_user() -> str:
    """The dedicated panel service account (set by the installer)."""
    return os.environ.get("PANEL_USER", "hostpanel")


def valid_linux_user(name: Optional[str]) -> bool:
    return bool(name) and bool(_VALID_USER.match(name))


def run_as(
    linux_user: str,
    argv: Sequence[str],
    *,
    input: Optional[str] = None,
    timeout: int = 60,
    check: bool = False,
) -> subprocess.CompletedProcess:
    """Run `argv` as `linux_user` via sudo. Never uses a shell.

    Raises ValueError for an invalid username so a bad value can never be spliced
    into a privileged command line.
    """
    if not valid_linux_user(linux_user):
        raise ValueError(f"Invalid linux_user for privilege demotion: {linux_user!r}")
    if not argv:
        raise ValueError("run_as requires a non-empty argv")
    cmd = ["sudo", "-n", "-u", linux_user, *argv]
    _log.debug("run_as %s: %s", linux_user, " ".join(cmd))
    return subprocess.run(
        cmd, input=input, capture_output=True, text=True, timeout=timeout, check=check
    )
