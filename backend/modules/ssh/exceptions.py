class SshError(Exception):
    pass

class InvalidKeyFormat(SshError):
    pass

class DuplicateKey(SshError):
    pass

class KeyNotFound(SshError):
    pass
