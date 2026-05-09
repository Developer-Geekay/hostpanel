from fastapi import APIRouter

router = APIRouter(prefix="/api/dummy", tags=["Dummy Plugin"])

@router.get("/hello")
async def hello():
    return {"message": "Hello from the dynamic dummy plugin!"}
