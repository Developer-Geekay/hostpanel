"""
SSL module config — reads from environment with sane defaults.
"""
import os

_DEFAULTS = {
    "PDNS_URL":             "http://127.0.0.1:8053",
    "PDNS_API_KEY":         "hostpanel-dns-api-key",
    "CERTBOT_EMAIL":        "admin@hostpanel.local",
    "DNS_PROPAGATION_WAIT": "30",
    "CERTS_WORK_DIR":       "/opt/hostpanel/certs",
    "PANEL_PORT":           "2082",
    "PANEL_SSL_PORT":       "2083",
    "PANEL_BACKEND_PORT":   "2081",
}


def get(key: str) -> str:
    return os.environ.get(key, _DEFAULTS.get(key, ""))


def get_int(key: str) -> int:
    val = get(key)
    try:
        return int(val)
    except ValueError:
        from .exceptions import ConfigValidationError
        raise ConfigValidationError(f"{key} must be an integer, got: {val!r}")


def get_bool(key: str) -> bool:
    return get(key).lower() in ("1", "true", "yes")


def load() -> dict:
    """Return validated config dict."""
    from .exceptions import ConfigValidationError
    cfg = {k: get(k) for k in _DEFAULTS}

    for port_key in ("PANEL_PORT", "PANEL_SSL_PORT", "PANEL_BACKEND_PORT"):
        port = get_int(port_key)
        if not (1 <= port <= 65535):
            raise ConfigValidationError(f"{port_key} must be between 1 and 65535, got {port}")
        cfg[port_key] = port

    cfg["DNS_PROPAGATION_WAIT"] = get_int("DNS_PROPAGATION_WAIT")

    # Derived paths — hooks dir sits alongside the backend at backend/hooks/
    cfg["HOOKS_DIR"] = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "hooks"
    )

    return cfg
