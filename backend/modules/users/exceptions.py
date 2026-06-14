class ProtectedUser(Exception):
    pass

class UserNotFound(Exception):
    pass

class UserAlreadyExists(Exception):
    pass

class UserOperationFailed(Exception):
    pass

class FtpOperationFailed(Exception):
    pass
