class ServiceError(Exception):
    pass

class ServiceNotFound(ServiceError):
    pass

class ServiceActionFailed(ServiceError):
    pass

class ServiceActionTimeout(ServiceError):
    pass
