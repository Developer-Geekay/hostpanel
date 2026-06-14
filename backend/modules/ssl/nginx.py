"""
Nginx config generation, enabling, testing, reloading, and rollback.
Uses Jinja2 to render templates/nginx_cpanel.conf.j2.
"""
import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, TemplateNotFound

from .exceptions import NginxConfigInvalidError, NginxReloadError

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
_NGINX_BIN = "/opt/hostpanel/plugins/nginx/nginx"


def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(_TEMPLATES_DIR),
        autoescape=False,
        keep_trailing_newline=True,
    )


def generate_config(
    domain: str,
    cert_path: str,
    document_root: str,
    cpanel_port: int = 2082,
    cpanel_ssl_port: int = 2083,
    cpanel_backend_port: int = 2081,
) -> str:
    """
    Render nginx_cpanel.conf.j2 and return the config string.
    cert_path: directory containing fullchain.pem and privkey.pem
               (e.g. /etc/letsencrypt/live/consoleapi.in)
    """
    try:
        env = _jinja_env()
        template = env.get_template("nginx_cpanel.conf.j2")
    except TemplateNotFound:
        raise NginxConfigInvalidError(
            f"Jinja2 template not found in {_TEMPLATES_DIR}. "
            "Ensure nginx_cpanel.conf.j2 is present."
        )

    return template.render(
        domain=domain,
        cert_path=cert_path,
        document_root=document_root,
        cpanel_port=cpanel_port,
        cpanel_ssl_port=cpanel_ssl_port,
        cpanel_backend_port=cpanel_backend_port,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


def write_config(domain: str, config_content: str, vhosts_dir: str) -> str:
    """
    Write rendered config to vhosts_dir/cpanel.<domain>.conf.
    Returns the full file path written.
    """
    os.makedirs(vhosts_dir, exist_ok=True)
    config_path = os.path.join(vhosts_dir, f"cpanel.{domain}.conf")
    with open(config_path, "w") as f:
        f.write(config_content)
    logger.info(f"Nginx config written: {config_path}")
    return config_path


def test_config(nginx_bin: str = None) -> None:
    """
    Run `nginx -t` against the live nginx config.
    Raises NginxConfigInvalidError with nginx output on failure.
    """
    bin_path = nginx_bin or _NGINX_BIN
    result = subprocess.run(
        ["sudo", "-n", bin_path, "-t"],
        capture_output=True,
        text=True,
        shell=False,
    )
    output = (result.stderr or result.stdout).strip()
    syntax_ok = "syntax is ok" in output
    if result.returncode != 0 and not syntax_ok:
        raise NginxConfigInvalidError(f"nginx -t failed:\n{output}")
    logger.debug(f"nginx -t passed: {output}")


def reload_nginx(nginx_bin: str = None) -> None:
    """
    Send reload signal to nginx. Raises NginxReloadError on failure.
    """
    bin_path = nginx_bin or _NGINX_BIN
    result = subprocess.run(
        ["sudo", "-n", bin_path, "-s", "reload"],
        capture_output=True,
        text=True,
        shell=False,
    )
    if result.returncode != 0:
        output = (result.stderr or result.stdout).strip()
        raise NginxReloadError(f"nginx reload failed:\n{output}")
    logger.info("nginx reloaded successfully.")


def rollback_config(domain: str, vhosts_dir: str) -> None:
    """
    Remove cpanel vhost config on failure.
    Logs rollback action but does not raise — best-effort cleanup.
    """
    config_path = os.path.join(vhosts_dir, f"cpanel.{domain}.conf")
    if os.path.exists(config_path):
        try:
            os.remove(config_path)
            logger.warning(f"Rollback: removed nginx config {config_path}")
        except OSError as e:
            logger.error(f"Rollback failed — could not remove {config_path}: {e}")
    else:
        logger.debug(f"Rollback: no config found at {config_path}, nothing to remove.")


def config_exists(domain: str, vhosts_dir: str) -> bool:
    return os.path.exists(os.path.join(vhosts_dir, f"cpanel.{domain}.conf"))


def read_config(domain: str, vhosts_dir: str) -> str | None:
    path = os.path.join(vhosts_dir, f"cpanel.{domain}.conf")
    if not os.path.isfile(path):
        return None
    with open(path) as f:
        return f.read()
