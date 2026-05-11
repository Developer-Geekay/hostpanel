from fastapi import APIRouter

PLUGIN_MANIFEST = {
    "nav_route": "dummy",
    "nav_label": "Dummy",
    "nav_icon": "extension",
    "nav_section": "hosting",
    "admin_only": True,
    # Declare the systemd service this package manages (optional).
    # The services page will show this entry after the built-in services.
    # "service": {
    #     "name": "dummy",           # key used in the API
    #     "unit": "hostpanel-dummy", # systemd unit name
    #     "label": "Dummy Service",  # display label
    #     "icon": "extension",       # material icon
    #     "can_reload": False,
    # },
}

router = APIRouter(prefix="/cpanelapi/dummy", tags=["Dummy Plugin"])

@router.get("/hello")
async def hello():
    return {"message": "Hello from the dynamic dummy plugin!"}
