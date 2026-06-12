"""
PyInstaller Compilation Script

This script automates the compilation of the HostPanel FastAPI backend application
into a standalone, single-file executable (`hostpanel-api`) using PyInstaller.

Capabilities:
- Resolves and includes all dynamic/hidden imports necessary for ASGI uvicorn servers,
  fastapi, email_validator, and passlib/bcrypt libraries.
- Standardizes cross-platform builds (Linux, macOS, and Windows).
- Provides guidance on registering the generated executable as a system daemon/service.
"""
import PyInstaller.__main__
import os
import platform

def build_executable():
    """
    Builds the FastAPI application into a standalone executable using PyInstaller.
    """
    print(f"Building HostPanel API executable for {platform.system()}...")

    # The entry point of our application
    entry_point = "main.py"

    # Define the arguments for PyInstaller
    args = [
        entry_point,
        "--name=hostpanel-api",       # Name of the generated executable
        "--onefile",                  # Package everything into a single executable file
        "--noconfirm",                # Replace output directory without asking confirmation
        # Include hidden imports for uvicorn and fastapi to ensure they aren't missed
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.http.h11_impl",
        "--hidden-import=uvicorn.protocols.http.httptools_impl",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.protocols.websockets.websockets_impl",
        "--hidden-import=email_validator",
        "--hidden-import=passlib.handlers.bcrypt",
        "--hidden-import=bcrypt",
    ]

    # Additional arguments to handle specific operating systems
    # For Windows daemonizing, you might consider using tools like NSSM later,
    # as creating a native Windows service purely in Python requires pywin32,
    # which can be complex to bundle via PyInstaller reliably.
    
    # Run PyInstaller
    PyInstaller.__main__.run(args)
    
    print("\nBuild completed successfully!")
    print(f"You can find the executable in the 'dist' directory.")

if __name__ == "__main__":
    build_executable()
