"""
Shared FastAPI dependency functions for authentication and authorization.
Import from here in all routers — do NOT import from main.py to avoid
circular imports.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from auth import User, decode_access_token
from portal_users import get_user as get_portal_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/cpanelapi/token")


def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Decode JWT, look up the portal user, and return a User object."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = decode_access_token(token)
    if token_data is None or token_data.username is None:
        raise credentials_exception

    portal_user = get_portal_user(token_data.username)
    if portal_user is None or portal_user.disabled:
        raise credentials_exception

    return User(
        username=portal_user.username,
        role=portal_user.role,
        linux_user=portal_user.linux_user,
        disabled=portal_user.disabled,
        protected=portal_user.protected,
    )


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that raises 403 unless the current user is an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
