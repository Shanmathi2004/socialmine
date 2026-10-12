
import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Integer, func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.campaign import Campaign
from app.models.post import Post
from app.models.user import User
from app.models.publishing_log import PublishingLog
from app.schemas.campaign import CampaignCreate, CampaignResponse
from app.security.dependencies import get_current_user


router = APIRouter(
    prefix="/api/campaigns",
    tags=["Campaigns"],
)


def get_owned_campaign(
    campaign_id: int,
    db: Session,
    user_id: int,
) -> Campaign:
    campaign = (
        db.query(Campaign)
        .filter(
            Campaign.id == campaign_id,
            Campaign.user_id == user_id,
        )
        .first()
    )

    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found.",
        )

    return campaign


def validate_campaign_dates(data: CampaignCreate) -> None:
    if (
        data.start_date is not None
        and data.end_date is not None
        and data.end_date <= data.start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be after the start date.",
        )


def get_campaign_revenue(
    budget: float,
    requested_revenue: float | None,
) -> float:
    """
    Generate illustrative revenue when no positive revenue is supplied.
    This is demo data, not actual sales.
    """
    budget = max(float(budget or 0), 0)
    requested_revenue = float(requested_revenue or 0)

    if requested_revenue > 0:
        return round(requested_revenue, 2)

    if budget <= 0:
        return 0.0

    multiplier = random.uniform(1.2, 2.5)
    return round(budget * multiplier, 2)


# ============================================================
# CREATE CAMPAIGN
# ============================================================

@router.post(
    "",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_campaign(
    data: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    validate_campaign_dates(data)

    budget = float(data.budget or 0)
    revenue = get_campaign_revenue(
        budget,
        data.revenue,
    )

    campaign = Campaign(
        user_id=current_user.id,
        name=data.name.strip(),
        description=data.description,
        platform=data.platform,
        objectives=data.objectives,
        status=data.status,
        start_date=data.start_date,
        end_date=data.end_date,
        budget=budget,
        revenue=revenue,
    )

    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    return campaign


# ============================================================
# GET ALL CAMPAIGNS
# ============================================================

@router.get(
    "",
    response_model=list[CampaignResponse],
)
def get_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Campaign)
        .filter(Campaign.user_id == current_user.id)
        .order_by(Campaign.created_at.desc())
        .all()
    )


# ============================================================
# GET SINGLE CAMPAIGN
# ============================================================

@router.get(
    "/{campaign_id}",
    response_model=CampaignResponse,
)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_campaign(
        campaign_id,
        db,
        current_user.id,
    )


# ============================================================
# UPDATE CAMPAIGN
# ============================================================

@router.put(
    "/{campaign_id}",
    response_model=CampaignResponse,
)
def update_campaign(
    campaign_id: int,
    data: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = get_owned_campaign(
        campaign_id,
        db,
        current_user.id,
    )

    validate_campaign_dates(data)

    budget = float(data.budget or 0)
    revenue = get_campaign_revenue(
        budget,
        data.revenue,
    )

    campaign.name = data.name.strip()
    campaign.description = data.description
    campaign.platform = data.platform
    campaign.objectives = data.objectives
    campaign.status = data.status
    campaign.start_date = data.start_date
    campaign.end_date = data.end_date
    campaign.budget = budget
    campaign.revenue = revenue

    db.commit()
    db.refresh(campaign)

    return campaign


# ============================================================
# DELETE CAMPAIGN
# ============================================================

@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = get_owned_campaign(
        campaign_id,
        db,
        current_user.id,
    )

    # Keep posts and publishing history; only detach the campaign.
    db.query(Post).filter(
        Post.campaign_id == campaign.id,
        Post.user_id == current_user.id,
    ).update(
        {"campaign_id": None},
        synchronize_session=False,
    )

    db.delete(campaign)
    db.commit()

    return {
        "success": True,
        "message": "Campaign deleted successfully.",
        "campaign_id": campaign_id,
    }


# ============================================================
# CAMPAIGN STATISTICS AND ANALYTICS
# ============================================================

@router.get("/{campaign_id}/stats")
def get_campaign_stats(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = get_owned_campaign(
        campaign_id,
        db,
        current_user.id,
    )

    posts = (
        db.query(Post)
        .filter(
            Post.campaign_id == campaign.id,
            Post.user_id == current_user.id,
        )
        .all()
    )

    total_posts = len(posts)
    draft_posts = sum(p.status == "draft" for p in posts)
    scheduled_posts = sum(p.status == "scheduled" for p in posts)
    published_posts = sum(p.status == "published" for p in posts)
    failed_posts = sum(p.status == "failed" for p in posts)

    metrics = (
        db.query(
            func.count(PublishingLog.id).label("attempts"),
            func.coalesce(
                func.sum(
                    func.cast(
                        PublishingLog.status == "published",
                        Integer,
                    )
                ),
                0,
            ).label("successful"),
            func.coalesce(
                func.sum(
                    func.cast(
                        PublishingLog.status == "failed",
                        Integer,
                    )
                ),
                0,
            ).label("failed"),
            func.coalesce(
                func.sum(PublishingLog.likes), 0
            ).label("likes"),
            func.coalesce(
                func.sum(PublishingLog.comments), 0
            ).label("comments"),
            func.coalesce(
                func.sum(PublishingLog.shares), 0
            ).label("shares"),
            func.coalesce(
                func.sum(PublishingLog.reach), 0
            ).label("reach"),
            func.coalesce(
                func.sum(PublishingLog.views), 0
            ).label("views"),
        )
        .join(Post, PublishingLog.post_id == Post.id)
        .filter(
            Post.campaign_id == campaign.id,
            Post.user_id == current_user.id,
        )
        .one()
    )

    attempts = int(metrics.attempts or 0)
    successful = int(metrics.successful or 0)
    failed = int(metrics.failed or 0)

    success_rate = (
        round(successful / attempts * 100, 2)
        if attempts
        else 0
    )

    budget = float(campaign.budget or 0)
    revenue = float(campaign.revenue or 0)

    roi = (
        round(((revenue - budget) / budget) * 100, 2)
        if budget > 0
        else None
    )

    return {
        "campaign_id": campaign.id,
        "campaign_name": campaign.name,
        "campaign_status": campaign.status,
        "platform": campaign.platform,
        "objectives": campaign.objectives,
        "start_date": campaign.start_date,
        "end_date": campaign.end_date,
        "total_posts": total_posts,
        "draft_posts": draft_posts,
        "scheduled_posts": scheduled_posts,
        "published_posts": published_posts,
        "failed_posts": failed_posts,
        "publishing_attempts": attempts,
        "successful_attempts": successful,
        "failed_attempts": failed,
        "success_rate": success_rate,
        "likes": int(metrics.likes or 0),
        "comments": int(metrics.comments or 0),
        "shares": int(metrics.shares or 0),
        "reach": int(metrics.reach or 0),
        "views": int(metrics.views or 0),
        "budget": budget,
        "revenue": revenue,
        "roi": roi,
    }
