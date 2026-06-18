class MailError(Exception):
    pass

class MailDomainNotFound(MailError):
    pass

class MailDomainExists(MailError):
    pass

class MailAccountNotFound(MailError):
    pass

class MailAccountExists(MailError):
    pass

class MailOperationFailed(MailError):
    pass
