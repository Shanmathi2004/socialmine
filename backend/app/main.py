
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.social_accounts import router as social_accounts_router
from app.social.instagram import router as instagram_router
from app.routes.posts import router as posts_router
from app.routes.publishing_logs import router as publishing_logs_router
from app.routes.publishing import router as publishing_router
from app.routes.publishing_queue import router as publishing_queue_router
from app.routes.campaigns import router as campaigns_router
from app.routes.uploads import router as uploads_router
from app.scheduler import start_scheduler
from app.routes.instagram_insights import router as instagram_insights_router
from app.routes.background_publishing import router as background_publishing_router
from app.social.facebook import router as facebook_router
from app.social.linkedin import router as linkedin_router
from app.social.youtube import router as youtube_router
from app.social.pinterest import router as pinterest_router
from app.routes.notifications import router as notifications_router

app = FastAPI(
    title="SocialPilot API",
    version="1.0.0",
)


start_scheduler()


# ============================================================
# UPLOADS
# ============================================================

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(social_accounts_router)

app.include_router(instagram_router)
app.include_router(facebook_router)
app.include_router(linkedin_router)
app.include_router(youtube_router)
app.include_router(pinterest_router)

app.include_router(posts_router)
app.include_router(publishing_logs_router)
app.include_router(publishing_router)
app.include_router(publishing_queue_router)
app.include_router(campaigns_router)
app.include_router(uploads_router)
app.include_router(instagram_insights_router)
app.include_router(background_publishing_router)

app.include_router(notifications_router)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Welcome to SocialPilot"
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "SocialPilot Backend",
    }

