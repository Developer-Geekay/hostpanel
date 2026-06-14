class AgentBaseError(Exception):
    pass


# ── Config ────────────────────────────────────────────────────────────────────

class ConfigNotFoundError(AgentBaseError):
    pass

class ConfigValidationError(AgentBaseError):
    pass


# ── Domain ────────────────────────────────────────────────────────────────────

class DomainValidationError(AgentBaseError):
    pass

class DomainNotResolvableError(AgentBaseError):
    pass

class DomainNotInPowerDNSError(AgentBaseError):
    pass


# ── Certbot ───────────────────────────────────────────────────────────────────

class CertbotNotInstalledError(AgentBaseError):
    pass

class CertbotExecutionError(AgentBaseError):
    pass

class CertAlreadyExistsError(AgentBaseError):
    pass

class CertExpansionError(AgentBaseError):
    pass


# ── Nginx ─────────────────────────────────────────────────────────────────────

class NginxNotInstalledError(AgentBaseError):
    pass

class NginxConfigExistsError(AgentBaseError):
    pass

class NginxConfigInvalidError(AgentBaseError):
    pass

class NginxReloadError(AgentBaseError):
    pass


# ── System ────────────────────────────────────────────────────────────────────

class FirewallError(AgentBaseError):
    pass

class DNSPropagationError(AgentBaseError):
    pass

class RootPrivilegesError(AgentBaseError):
    pass

class PowerDNSConnectionError(AgentBaseError):
    pass
