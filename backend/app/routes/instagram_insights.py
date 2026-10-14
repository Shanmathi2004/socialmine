
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.post import Post
from app.models.publishing_log import PublishingLog
from app.models.social_account import SocialAccount
from app.models.user import User
from app.security.dependencies import get_current_user
from app.services.instagram_insights_service import (
    fetch_instagram_insights,
    fetch_instagram_account_insights,
)

router = APIRouter(
    prefix="/api/instagram",
    tags=["Instagram Analytics"],
)


@router.get("/insights/{publishing_log_id}")
def get_instagram_insights(
    publishing_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = (
        db.query(PublishingLog)
        .join(Post, PublishingLog.post_id == Post.id)
        .filter(
            PublishingLog.id == publishing_log_id,
            PublishingLog.platform == "instagram",
            Post.user_id == current_user.id,
        )
        .first()
    )

    if not log:
        raise HTTPException(
            status_code=404,
            detail="Instagram publishing log not found.",
        )

    try:
        return fetch_instagram_insights(
            db=db,
            publishing_log=log,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@router.get("/account-insights/{social_account_id}")
def get_instagram_account_insights(
    social_account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    social_account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.id == social_account_id,
            SocialAccount.user_id == current_user.id,
            SocialAccount.platform == "instagram",
        )
        .first()
    )

    if not social_account:
        raise HTTPException(
            status_code=404,
            detail="Connected Instagram account not found.",
        )

    try:
        return fetch_instagram_account_insights(
            db=db,
            social_account=social_account,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )
