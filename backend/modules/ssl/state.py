"""
Tracks all SSL-managed domains in a JSON state file.
Atomic writes via .tmp + os.rename() to prevent corruption on crash.
"""
import json
import logging
import os
import stat
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_EMPTY_STATE = {"domains": {}}


def load_state(state_file: str) -> dict:
    """Load state JSON. Returns empty structure if file missing or unreadable."""
    if not os.path.isfile(state_file):
        return _EMPTY_STATE.copy()
    try:
        with open(state_file) as f:
            data = json.load(f)
        if "domains" not in data:
            data["domains"] = {}
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not read state file {state_file}: {e} — starting fresh")
        return _EMPTY_STATE.copy()


def save_state(state: dict, state_file: str) -> None:
    """Atomically write state to file (write .tmp then rename). Sets perms to 640."""
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    tmp_path = state_file + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(state, f, indent=2, default=str)
    # chmod 640 before moving into place
    os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP)
    os.rename(tmp_path, state_file)
    logger.debug(f"State saved to {state_file}")


def add_domain(state: dict, root_domain: str, domain_info: dict) -> dict:
    """Add or update a domain entry. Merges into existing entry if present."""
    now = datetime.now(timezone.utc).isoformat()
    existing = state["domains"].get(root_domain, {})
    updated = {
        **existing,
        **domain_info,
        "root_domain": root_domain,
        "last_updated": now,
    }
    if "added_at" not in updated:
        updated["added_at"] = now
    state["domains"][root_domain] = updated
    return state


def remove_domain(state: dict, root_domain: str) -> dict:
    """Remove a domain entry. Raises KeyError if not found."""
    if root_domain not in state["domains"]:
        raise KeyError(f"Domain '{root_domain}' not found in state")
    del state["domains"][root_domain]
    return state


def get_domain_info(state: dict, root_domain: str) -> dict | None:
    """Return domain info dict or None if not tracked."""
    return state["domains"].get(root_domain)


def all_domains(state: dict) -> list[dict]:
    """Return all domain entries as a list."""
    return list(state["domains"].values())
