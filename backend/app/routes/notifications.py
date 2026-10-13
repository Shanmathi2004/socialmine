from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.notification import Notification
from app.models.user import User
from app.security.dependencies import get_current_user

router = APIRouter(
    prefix="/api/notifications",
    tags=["Notifications"],
)


def notification_to_dict(notification: Notification):
    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "post_id": notification.post_id,
        "title": notification.title,
        "message": notification.message,
        "notification_type": notification.notification_type,
        "platform": notification.platform,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
    }


@router.get("/")
def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = db.query(Notification).filter(
        Notification.user_id == current_user.id
    )

    all_count = base_query.count()

    unread_count = base_query.filter(
        Notification.is_read.is_(False)
    ).count()

    query = base_query

    if unread_only:
        query = query.filter(
            Notification.is_read.is_(False)
        )

    total = query.count()

    items = (
        query.order_by(
            Notification.created_at.desc(),
            Notification.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "all_count": all_count,
        "unread_count": unread_count,
        "limit": limit,
        "offset": offset,
        "notifications": [
            notification_to_dict(item) for item in items
        ],
    }


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    return {"unread_count": count}


@router.patch("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found.",
        )

    if not notification.is_read:
        notification.is_read = True
        db.commit()
        db.refresh(notification)

    return {
        "message": "Notification marked as read.",
        "notification": notification_to_dict(notification),
    }


@router.patch("/read-all")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .update(
            {Notification.is_read: True},
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "message": "Notifications marked as read.",
        "updated_count": updated_count,
    }


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found.",
        )

    db.delete(notification)
    db.commit()

    return {
        "message": "Notification deleted successfully."
    }