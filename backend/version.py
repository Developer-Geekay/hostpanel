"""Single source of truth for the core version used in plugin compatibility checks.

Both the runtime plugin-load gate (main.py) and the Packages-page compatibility
badge (routers/packages.py) compare a plugin's ``requires_core`` against this, so
it must live in exactly one place — they previously held separate copies that
drifted (main.py at 1.1.x while packages.py stayed 1.0.0), which made valid
plugins show as "Incompatible" in the UI even though they loaded fine.

History:
  1.1.0 — plugin ``public_routers`` (self-authenticating routes)
  1.1.1 — SSL delete tolerates a domain no longer provisioned (orphan cert cleanup)
  1.1.2 — domains.vhost_only marker (listed in Virtual Hosts, hidden from SSL)
"""

CORE_VERSION = (1, 1, 2)
