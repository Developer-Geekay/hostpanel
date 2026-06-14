"""
SSL agent config — reads from environment variables (already loaded by FastAPI's
dotenv setup) with sane defaults. No separate config file needed; values live in
/opt/hostpanel/backend/.env alongside the rest of the panel config.
"""
import os
import stat

from .exceptions import ConfigValidationError

VALID_TSIG_ALGORITHMS = {"hmac-sha256", "hmac-sha384", "hmac-sha512"}

_DEFAULTS = {
    "PDNS_URL":                  "http://127.0.0.1:8053",
    "PDNS_API_KEY":              "hostpanel-dns-api-key",
    "CERTBOT_EMAIL":             "admin@hostpanel.local",
    "CERTBOT_CREDENTIALS_FILE":  "/etc/letsencrypt/pdns.ini",
    "DNS_PROPAGATION_WAIT":      "30",
    "SSL_STATE_FILE":            "/etc/ssl-cpanel-agent/state.json",
    "NGINX_VHOSTS_DIR":          "/opt/hostpanel/plugins/nginx/vhosts",
    "NGINX_RELOAD_CMD":          "sudo -n systemctl reload hostpanel-nginx",
    "PANEL_PORT":                "2082",
    "PANEL_SSL_PORT":            "2083",
    "PANEL_BACKEND_PORT":        "2081",
    "FIREWALL_BACKEND":          "ufw",
    "FIREWALL_ENABLED":          "true",
    "TSIG_ALGORITHM":            "hmac-sha512",
}


def get(key: str) -> str:
    return os.environ.get(key, _DEFAULTS.get(key, ""))


def get_int(key: str) -> int:
    val = get(key)
    try:
        return int(val)
    except ValueError:
        raise ConfigValidationError(f"{key} must be an integer, got: {val!r}")


def get_bool(key: str) -> bool:
    return get(key).lower() in ("1", "true", "yes")


def load() -> dict:
    """Return validated config dict. Raises ConfigValidationError on bad values."""
    cfg = {k: get(k) for k in _DEFAULTS}

    # Validate port numbers
    for port_key in ("PANEL_PORT", "PANEL_SSL_PORT", "PANEL_BACKEND_PORT"):
        port = get_int(port_key)
        if not (1 <= port <= 65535):
            raise ConfigValidationError(f"{port_key} must be between 1 and 65535, got {port}")
        cfg[port_key] = port

    cfg["DNS_PROPAGATION_WAIT"] = get_int("DNS_PROPAGATION_WAIT")
    cfg["FIREWALL_ENABLED"] = get_bool("FIREWALL_ENABLED")

    # Validate TSIG algorithm
    algo = cfg["TSIG_ALGORITHM"].lower()
    if algo not in VALID_TSIG_ALGORITHMS:
        raise ConfigValidationError(
            f"TSIG_ALGORITHM must be one of {sorted(VALID_TSIG_ALGORITHMS)}, got {algo!r}"
        )
    cfg["TSIG_ALGORITHM"] = algo

    return cfg


def validate_credentials_file(path: str) -> None:
    """Verify certbot credentials file exists and has permissions 600."""
    if not os.path.isfile(path):
        raise ConfigValidationError(f"Certbot credentials file not found: {path}")

    file_stat = os.stat(path)
    octal_perms = stat.S_IMODE(file_stat.st_mode)
    if octal_perms != 0o600:
        raise ConfigValidationError(
            f"Credentials file {path} must have permissions 600, "
            f"got {oct(octal_perms)}"
        )

    required_keys = {
        "dns_rfc2136_server",
        "dns_rfc2136_port",
        "dns_rfc2136_name",
        "dns_rfc2136_secret",
        "dns_rfc2136_algorithm",
    }
    found_keys = set()
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key = line.split("=", 1)[0].strip()
            found_keys.add(key)

    missing = required_keys - found_keys
    if missing:
        raise ConfigValidationError(
            f"Credentials file {path} missing required keys: {sorted(missing)}"
        )
