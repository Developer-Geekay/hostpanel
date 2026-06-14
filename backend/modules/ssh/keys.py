import base64
import hashlib
import os
import subprocess
import tempfile
from datetime import date

from db import get_conn
from modules.ssh.exceptions import DuplicateKey, InvalidKeyFormat, KeyNotFound

VALID_KEY_TYPES = frozenset([
    "ssh-rsa", "ssh-dss", "ssh-ed25519",
    "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
    "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com",
])


def _home(linux_user: str) -> str:
    return "/root" if linux_user == "root" else f"/home/{linux_user}"


def _auth_keys_path(linux_user: str) -> str:
    return os.path.join(_home(linux_user), ".ssh", "authorized_keys")


def _ensure_ssh_dir(linux_user: str) -> None:
    path = _auth_keys_path(linux_user)
    ssh_dir = os.path.dirname(path)
    os.makedirs(ssh_dir, exist_ok=True)
    os.chmod(ssh_dir, 0o700)
    if not os.path.exists(path):
        open(path, 'a').close()
    os.chmod(path, 0o600)


def _read_lines(linux_user: str) -> list[str]:
    path = _auth_keys_path(linux_user)
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return f.readlines()


def _write_lines(linux_user: str, lines: list[str]) -> None:
    _ensure_ssh_dir(linux_user)
    path = _auth_keys_path(linux_user)
    with open(path, 'w') as f:
        f.writelines(lines)
    os.chmod(path, 0o600)


def _compute_fingerprint(key_line: str) -> str:
    """Compute SHA256 fingerprint via ssh-keygen, fall back to manual hash."""
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pub', delete=False) as f:
            f.write(key_line.strip() + '\n')
            fname = f.name
        result = subprocess.run(
            ["ssh-keygen", "-lf", fname, "-E", "sha256"],
            capture_output=True, text=True, timeout=5,
        )
        os.unlink(fname)
        if result.returncode == 0:
            parts = result.stdout.strip().split()
            if len(parts) >= 2:
                return parts[1]
    except Exception:
        pass
    # Manual fallback: SHA256 of the raw key bytes
    parts = key_line.strip().split()
    if len(parts) >= 2:
        raw = base64.b64decode(parts[1] + "==")
        digest = hashlib.sha256(raw).digest()
        return "SHA256:" + base64.b64encode(digest).decode().rstrip("=")
    return "SHA256:unknown"


def _validate_format(key_line: str) -> None:
    parts = key_line.strip().split()
    if len(parts) < 2:
        raise InvalidKeyFormat("Key must be '<type> <base64> [comment]'")
    if parts[0] not in VALID_KEY_TYPES:
        raise InvalidKeyFormat(f"Unknown key type '{parts[0]}'")
    try:
        base64.b64decode(parts[1] + "==")
    except Exception:
        raise InvalidKeyFormat("Key data is not valid base64")


def _get_metadata(linux_user: str, fingerprint: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT label, added_at FROM ssh_keys WHERE linux_user=? AND fingerprint=?",
            (linux_user, fingerprint),
        ).fetchone()
    return dict(row) if row else None


def list_keys(linux_user: str) -> list[dict]:
    lines = _read_lines(linux_user)
    keys = []
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) < 2 or parts[0] not in VALID_KEY_TYPES:
            continue
        fp = _compute_fingerprint(line)
        meta = _get_metadata(linux_user, fp)
        comment = parts[2] if len(parts) > 2 else ""
        keys.append({
            "id":          fp,
            "type":        parts[0],
            "fingerprint": fp,
            "label":       meta["label"] if meta else comment,
            "added":       meta["added_at"] if meta else "",
        })
    return keys


def add_key(linux_user: str, public_key: str, label: str) -> dict:
    public_key = public_key.strip()
    _validate_format(public_key)

    lines = _read_lines(linux_user)
    fp = _compute_fingerprint(public_key)

    # Duplicate check
    for raw in lines:
        line = raw.strip()
        if line and not line.startswith('#') and _compute_fingerprint(line) == fp:
            raise DuplicateKey("This key is already in authorized_keys")

    lines.append(public_key + '\n')
    _write_lines(linux_user, lines)

    today = date.today().isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO ssh_keys (linux_user, fingerprint, label, added_at) "
            "VALUES (?, ?, ?, ?)",
            (linux_user, fp, label.strip(), today),
        )
    key_type = public_key.strip().split()[0]
    return {"id": fp, "type": key_type, "fingerprint": fp, "label": label.strip(), "added": today}


def remove_key(linux_user: str, fingerprint: str) -> None:
    lines = _read_lines(linux_user)
    new_lines = []
    removed = False
    for raw in lines:
        line = raw.strip()
        if line and not line.startswith('#') and _compute_fingerprint(line) == fingerprint:
            removed = True
            continue
        new_lines.append(raw)
    if not removed:
        raise KeyNotFound(f"Key {fingerprint} not found")
    _write_lines(linux_user, new_lines)
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM ssh_keys WHERE linux_user=? AND fingerprint=?",
            (linux_user, fingerprint),
        )
