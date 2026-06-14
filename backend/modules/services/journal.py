import subprocess

from modules.services.exceptions import ServiceActionFailed, ServiceActionTimeout


def get_logs(unit: str, lines: int = 200) -> list[str]:
    try:
        result = subprocess.run(
            ["sudo", "journalctl", "-u", unit, "-n", str(min(lines, 1000)),
             "--no-pager", "--output=short-iso"],
            capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip().split("\n") if result.stdout.strip() else []
    except subprocess.TimeoutExpired:
        raise ServiceActionTimeout("Log fetch timed out")
    except Exception as exc:
        raise ServiceActionFailed(str(exc))
