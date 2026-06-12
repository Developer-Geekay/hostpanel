"""
Extensible Plugin Hooks System

This module implements a dynamic hook system that allows HostPanel plugins
to hook into core backend lifecycle events.

Key Functions:
- `call_hooks`: Dynamically discovers and invokes package entry points registered under a specific group name.
  Supports both asynchronous (co-routine) and synchronous callback functions safely in a non-fatal manner.

Hook Groups:
- `hostpanel.hooks.on_startup`: Invoked when the API server begins startup.
- `hostpanel.hooks.domain_delete`: Invoked when a hosted domain is deleted (e.g., cascade cleaning Web server configs).
- `hostpanel.hooks.ssl_cert_deleted`: Invoked when an SSL certificate is revoked or deleted.
- `hostpanel.hooks.ssl_force_https`: Invoked when force-HTTPS settings are toggled.
- `hostpanel.hooks.user_delete`: Invoked when a Linux hosting user is removed from the system.
"""
import asyncio
import importlib.metadata
import logging

logger = logging.getLogger(__name__)


async def call_hooks(group: str, **kwargs):
    """Discover and call all entry points registered under `group`. Non-fatal."""
    try:
        eps = importlib.metadata.entry_points()
        hook_eps = eps.select(group=group) if hasattr(eps, 'select') else eps.get(group, [])
        for ep in hook_eps:
            try:
                fn = ep.load()
                if asyncio.iscoroutinefunction(fn):
                    await fn(**kwargs)
                else:
                    fn(**kwargs)
            except Exception as e:
                logger.warning(f"Hook '{ep.name}' in group '{group}' failed: {e}")
    except Exception as e:
        logger.error(f"Failed to discover hooks for group '{group}': {e}")
