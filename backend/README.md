# HostPanel Backend

This is the Python (FastAPI) backend for the HostPanel platform.

## Setup & Environment

1. Create a virtual environment: `python -m venv venv`
2. Activate it:
   - macOS/Linux: `source venv/bin/activate`
   - Windows: `venv\Scripts\activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in your details.

## Running in Dev Mode

To start the server in development mode:
```bash
python main.py
```
This will start Uvicorn with auto-reload.

## API Documentation (Swagger)

FastAPI automatically generates an interactive Swagger UI for testing the services.
By default (in `development` environment), you can access it at:

- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

*Note: If `ENVIRONMENT=production` is set in your `.env` file, these doc URLs will be disabled.*

## Logging

All logs, errors, and warnings are captured using Python's built-in `logging` module and are written to:
`backend/logs/hostpanel.log`

The logger is configured to rotate files up to 5MB and keeps the last 5 backup logs.

## Building for Production (Daemon / Executable)

We use `PyInstaller` to compile the Python application into a single executable that can be run as a desktop daemon or background service across Mac, Linux, and Windows.

To build the executable, run:
```bash
python build.py
```

After a successful build, the standalone executable will be generated in the `dist/` directory.

### Running as a Service
You can take the generated executable from `dist/hostpanel-api` and configure it as a background service:
- **Windows**: Use [NSSM](http://nssm.cc/) to install it as a Windows Service.
- **Linux**: Create a `systemd` service file to run it as a daemon.
- **Mac**: Create a `launchd` plist to keep it running in the background.
