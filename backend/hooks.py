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
