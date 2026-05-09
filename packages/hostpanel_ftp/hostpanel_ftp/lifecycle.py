import subprocess
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

PURE_PW = "/opt/hostpanel/ftp/bin/pure-pw"
PASSWD_FILE = "/opt/hostpanel/ftp/etc/pureftpd.passwd"
PDB_FILE = "/opt/hostpanel/ftp/etc/pureftpd.pdb"

def _rebuild_db():
    try:
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pure-pw mkdb failed: {e.stderr}")

def pre_uninstall(force: bool):
    """
    Lifecycle hook called before uninstalling the hostpanel-ftp package.
    Checks if FTP users exist. If so, blocks uninstallation unless force=True.
    """
    logger.info(f"FTP pre_uninstall hook called with force={force}")
    
    try:
        result = subprocess.run(
            ["sudo", PURE_PW, "list", "-f", PASSWD_FILE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        users = []
        for line in result.stdout.strip().splitlines():
            if line:
                users.append(line.split()[0])
                
        if users:
            if not force:
                raise HTTPException(
                    status_code=409, 
                    detail=f"There are {len(users)} FTP user(s) currently configured. Uninstalling this module will permanently delete these users. Are you sure you want to proceed?"
                )
            else:
                # Force is true, delete the users
                logger.warning(f"Force uninstalling FTP module. Deleting {len(users)} users...")
                for username in users:
                    subprocess.run(["sudo", PURE_PW, "userdel", username, "-f", PASSWD_FILE], check=False)
                _rebuild_db()
                logger.info("FTP users successfully purged.")
                
    except HTTPException:
        raise
    except FileNotFoundError:
        # pure-pw might not be installed, ignore
        pass
    except Exception as e:
        logger.error(f"Error checking FTP users during uninstall: {e}")
