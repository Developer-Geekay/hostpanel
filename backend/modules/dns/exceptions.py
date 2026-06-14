class DnsServiceError(Exception):
    """PowerDNS returned an unexpected error or is unreachable."""

class ZoneNotFound(Exception):
    pass

class ZoneAlreadyExists(Exception):
    pass

class RecordNotFound(Exception):
    pass
