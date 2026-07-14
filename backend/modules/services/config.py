"""
Read/write a service's real config file.

The Services page used to show hardcoded template content; this reads and writes
the actual file a service declares via `config_path` (plugin manifest service
block, or a built-in map). Admin-only, path is never client-supplied — it comes
from the service registry.
"""
import subprocess

from modules.services.exceptions import ServiceActionFailed


def read_config(path: str) -> str:
    r = subprocess.run(["sudo", "-n", "cat", path],
                       capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        raise ServiceActionFailed(r.stderr.strip() or f"Could not read {path}")
    return r.stdout


def write_config(path: str, content: str) -> None:
    # Preserve a trailing newline; most config parsers want one.
    if content and not content.endswith("\n"):
        content += "\n"
    r = subprocess.run(["sudo", "-n", "tee", path],
                       input=content, capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        raise ServiceActionFailed(r.stderr.strip() or f"Could not write {path}")
