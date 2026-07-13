"""
Shared FastAPI Authentication & Authorization Dependencies

This module provides common dependencies for route protection:
- `get_current_user`: Decodes JWT tokens, validates credentials against the portal database,
  checks account status, and injects the authenticated `User` object into the path operation.
- `require_admin`: Restricts routes to administrators only, raising a 403 Forbidden error for regular users.

Important:
Import these dependency functions from here in all routers — do NOT import from main.py
to avoid circular imports.
"""
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from auth import User, decode_access_token
from portal_users import get_user as get_portal_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/cpanelapi/token", auto_error=False)


def get_current_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> User:
    """Decode JWT, look up the portal user, and return a User object.
    Accepts token from Authorization header or ?token= query param (for browser downloads).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw = token or request.query_params.get("token")
    if not raw:
        raise credentials_exception
    token_data = decode_access_token(raw)
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


def user_owns(current_user: User, owner: Optional[str]) -> bool:
    """True if the user may act on a resource owned by Linux user `owner`.

    Admins may act on anything; a tenant may act only on resources whose owner
    matches their bound `linux_user`. This is the single source of truth for the
    ownership check that used to be inlined in several routers.
    """
    if current_user.role == "admin":
        return True
    return current_user.linux_user is not None and current_user.linux_user == owner


def assert_owner(current_user: User, owner: Optional[str]) -> None:
    """Raise 403 unless `current_user` is an admin or owns the resource."""
    if not user_owns(current_user, owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
