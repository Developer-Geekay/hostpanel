import logging
import subprocess
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

from deps import get_current_user
from auth import User

PLUGIN_MANIFEST = {
    "nav_route": "ftp",
    "nav_label": "FTP",
    "nav_icon": "swap_vert",
    "nav_section": "my_space",
    "admin_only": False,
}

router = APIRouter(prefix="/cpanelapi/ftp", tags=["FTP"])
logger = logging.getLogger(__name__)

PURE_PW   = "/opt/hostpanel/ftp/bin/pure-pw"
PASSWD_FILE = "/opt/hostpanel/ftp/etc/pureftpd.passwd"
PDB_FILE    = "/opt/hostpanel/ftp/etc/pureftpd.pdb"


class FTPAccount(BaseModel):
    username: str
    home_dir: str


class FTPCreateRequest(BaseModel):
    username: str
    password: str
    directory: Optional[str] = None


class FTPPasswordRequest(BaseModel):
    new_password: str


def _rebuild_db():
    """Rebuild the PureDB binary after any passwd change."""
    try:
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pure-pw mkdb failed: {e.stderr}")
        raise HTTPException(status_code=500, detail="Failed to rebuild FTP database")


def _run(command: List[str], input_data: str = None):
    """Run a pure-pw command with sudo, optionally piping input for passwords."""
    try:
        result = subprocess.run(
            ["sudo"] + command,
            input=input_data,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {' '.join(command)} — {e.stderr}")
        raise HTTPException(status_code=500, detail=e.stderr.strip() or "FTP command failed")


@router.get("/accounts", response_model=List[FTPAccount])
async def list_ftp_accounts(current_user: User = Depends(get_current_user)):
    """List FTP virtual accounts. Standard users see only their own account."""
    try:
        result = subprocess.run(
            ["sudo", PURE_PW, "list", "-f", PASSWD_FILE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        accounts = []
        for line in result.stdout.strip().splitlines():
            if line:
                parts = line.split()
                username = parts[0]
                home_dir = parts[1].rstrip("./") if len(parts) > 1 else f"/home/{username}"
                accounts.append({"username": username, "home_dir": home_dir})
        if current_user.role != "admin":
            accounts = [a for a in accounts if a["username"] == current_user.linux_user]
        return accounts
    except Exception as e:
        logger.error(f"Failed to list FTP accounts: {e}")
        raise HTTPException(status_code=500, detail="Failed to list FTP accounts")


@router.post("/accounts")
async def create_ftp_account(request: FTPCreateRequest, current_user: User = Depends(get_current_user)):
    """Create an FTP virtual account. Standard users can only create their own account."""
    username = request.username
    if current_user.role != "admin" and username != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")
    if request.directory:
        home_dir = request.directory.rstrip("/")
        if not home_dir.startswith(f"/home/{username}"):
            raise HTTPException(status_code=400, detail=f"FTP directory must be within /home/{username}/")
    else:
        home_dir = f"/home/{username}"
    logger.info(f"Creating FTP account: {username}")

    # Check the system user exists
    try:
        subprocess.run(["id", username], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=404, detail=f"System user '{username}' does not exist. Create the user first.")

    password_input = f"{request.password}\n{request.password}\n"
    _run(
        [PURE_PW, "useradd", username, "-u", username, "-d", home_dir, "-f", PASSWD_FILE],
        input_data=password_input
    )
    _rebuild_db()
    return {"message": f"FTP account {username} created"}


@router.put("/accounts/{username}/password")
async def change_ftp_password(username: str, request: FTPPasswordRequest, current_user: User = Depends(get_current_user)):
    """Change the FTP password for an account. Standard users can only change their own password."""
    if current_user.role != "admin" and username != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")
    logger.info(f"Changing FTP password for: {username}")
    password_input = f"{request.new_password}\n{request.new_password}\n"
    _run(
        [PURE_PW, "passwd", username, "-f", PASSWD_FILE],
        input_data=password_input
    )
    _rebuild_db()
    return {"message": f"FTP password changed for {username}"}


@router.delete("/accounts/{username}")
async def delete_ftp_account(username: str, current_user: User = Depends(get_current_user)):
    """Delete an FTP virtual account. Standard users can only delete their own account."""
    if current_user.role != "admin" and username != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")
    logger.info(f"Deleting FTP account: {username}")
    _run([PURE_PW, "userdel", username, "-f", PASSWD_FILE])
    _rebuild_db()
    return {"message": f"FTP account {username} deleted"}
