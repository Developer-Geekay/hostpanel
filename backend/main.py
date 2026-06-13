"""
HostPanel API Server Entry Point

This is the main entry point of the Hosting Control Panel backend application.
It sets up the FastAPI server, handles CORS settings, initializes rotating file logging,
dynamically discovers and mounts installed plugin routers, registers core routers,
bootstraps first-install administrators, and configures static SPA file serving.

Main Tasks:
- Environment Setup: Loads `.env` and checks for production vs development documentation.
- Middleware: Adds CORS authorization allowing Angular frontend origins.
- Security: Integrates OAuth2 token authentication routes (`/cpanelapi/token`).
- Plugin Integration: Dynamically loads entrypoint routers from installed Python packages.
- SPA Static Mounting: Cascades all unmatched requests to the Angular index.html for client-side routing.
"""
import os
import logging
from logging.handlers import RotatingFileHandler
from datetime import timedelta

import psutil
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from auth import Token, create_access_token, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from deps import get_current_user, oauth2_scheme
from audit import log_action
from db import init_db
from portal_users import ensure_admin_exists, get_user as get_portal_user
from routers import (
    audit_router,
    dashboard_router,
    users_router,
    ssh_router,
    databases_router,
    files_router,
    dns_router,
    ssl_router,
    services_router,
    packages_router
)

load_dotenv()

CORE_VERSION = (1, 0, 0)

# ── SPA static file handler ────────────────────────────────────────────────────
# Falls back to index.html for any path not matched by a real file so Angular's
# client-side router handles the route rather than getting a 404.
class SPAFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                response = await super().get_response("index.html", scope)
            else:
                raise
        # Prevent browsers from caching index.html and plugin scripts so
        # deployments are picked up immediately without a force-refresh.
        if path in ("index.html", "") or path.startswith("packages/"):
            response.headers["Cache-Control"] = "no-store"
        return response

FRONTEND_DIR = os.environ.get("FRONTEND_DIR", "/opt/hostpanel/frontend")

# Set up logging
log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "hostpanel.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=5),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Determine environment (decides if we show Swagger docs)
environment = os.environ.get("ENVIRONMENT", "development")
kwargs = {}
if environment == "production":
    kwargs["docs_url"] = None
    kwargs["redoc_url"] = None
    kwargs["openapi_url"] = None

app = FastAPI(
    title="Hosting Control Panel",
    redirect_slashes=False,
    docs_url=kwargs.get("docs_url", "/docs"),
    redoc_url=kwargs.get("redoc_url", "/redoc"),
    openapi_url=kwargs.get("openapi_url", "/openapi.json")
)

@app.on_event("startup")
async def startup_event():
    init_db()
    ensure_admin_exists(default_username, default_password)
    logger.info("HostPanel API is starting up...")
    # Let installed plugins do any on-startup provisioning (idempotent)
    try:
        startup_eps = importlib.metadata.entry_points()
        if hasattr(startup_eps, 'select'):
            startup_eps = startup_eps.select(group='hostpanel.hooks.on_startup')
        else:
            startup_eps = startup_eps.get('hostpanel.hooks.on_startup', [])
        for ep in startup_eps:
            try:
                fn = ep.load()
                import asyncio as _asyncio
                if _asyncio.iscoroutinefunction(fn):
                    await fn()
                else:
                    fn()
            except Exception as e:
                logger.warning(f"on_startup hook {ep.name} failed: {e}")
    except Exception as e:
        logger.warning(f"Could not run on_startup hooks: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("HostPanel API is shutting down...")

# CORS middleware to allow requests from the Angular frontend
frontend_urls = os.environ.get("FRONTEND_URLS", "http://localhost:4200,http://127.0.0.1:4200").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_urls,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return RedirectResponse("/app/dashboard")

default_username = os.environ.get("DEFAULT_USERNAME", "admin")
default_password = os.environ.get("DEFAULT_PASSWORD", "admin")

# Include module routers securely
app.include_router(audit_router,     dependencies=[Depends(get_current_user)])
app.include_router(dashboard_router, dependencies=[Depends(get_current_user)])
app.include_router(users_router, dependencies=[Depends(get_current_user)])
app.include_router(ssh_router, dependencies=[Depends(get_current_user)])
app.include_router(databases_router, dependencies=[Depends(get_current_user)])
app.include_router(files_router, dependencies=[Depends(get_current_user)])
app.include_router(dns_router, dependencies=[Depends(get_current_user)])
app.include_router(ssl_router, dependencies=[Depends(get_current_user)])
app.include_router(services_router, dependencies=[Depends(get_current_user)])
app.include_router(packages_router, dependencies=[Depends(get_current_user)])

# Dynamically load routers from installed plugins
import importlib.metadata
try:
    eps = importlib.metadata.entry_points()
    if hasattr(eps, 'select'):
        plugin_eps = eps.select(group='hostpanel.modules')
    else:
        plugin_eps = eps.get('hostpanel.modules', [])
    for ep in plugin_eps:
        try:
            plugin_module = ep.load()
            manifest = getattr(plugin_module, 'PLUGIN_MANIFEST', {})

            # Version compatibility check
            requires = manifest.get('requires_core')
            if requires and tuple(requires) > CORE_VERSION:
                logger.error(
                    f"Plugin '{ep.name}' requires core >= {requires}, "
                    f"but core is {CORE_VERSION}. Skipping."
                )
                continue

            if hasattr(plugin_module, 'routers'):
                for r in plugin_module.routers:
                    app.include_router(r, dependencies=[Depends(get_current_user)])
                logger.info(f"Dynamically loaded {len(plugin_module.routers)} router(s) from plugin: {ep.name}")
            elif hasattr(plugin_module, 'router'):
                app.include_router(plugin_module.router, dependencies=[Depends(get_current_user)])
                logger.info(f"Dynamically loaded router from plugin: {ep.name}")
        except Exception as e:
            logger.error(f"Failed to load plugin {ep.name}: {e}")
except Exception as e:
    logger.error(f"Error checking for plugin entry points: {e}")


@app.post("/cpanelapi/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    portal_user = get_portal_user(form_data.username)
    if not portal_user:
        logger.warning(f"Failed login attempt for username: {form_data.username}")
        log_action(form_data.username, "auth.login_fail", detail="user not found", status="error")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, portal_user.hashed_password):
        logger.warning(f"Failed login attempt for username: {form_data.username} (incorrect password)")
        log_action(form_data.username, "auth.login_fail", detail="wrong password", status="error")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if portal_user.disabled:
        log_action(form_data.username, "auth.login_fail", detail="account disabled", status="error")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info(f"Successful login for user: {form_data.username} (role={portal_user.role})")
    log_action(form_data.username, "auth.login")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": portal_user.username, "role": portal_user.role},
        expires_delta=access_token_expires,
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Mount Angular SPA — must be registered AFTER all API routes so /api/* routes
# take priority over the catch-all static file handler.
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", SPAFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info(f"Serving frontend from {FRONTEND_DIR}")
else:
    logger.warning(f"Frontend directory not found: {FRONTEND_DIR} — panel UI will not be served")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PANEL_BACKEND_PORT", "2081"))
    uvicorn.run(app, host="127.0.0.1", port=port)
