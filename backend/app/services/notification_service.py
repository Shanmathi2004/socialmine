
import logging

from sqlalchemy.orm import Session

from app.models.notification import Notification

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    post_id: int | None = None,
    platform: str | None = None,
):
    try:
        notification = Notification(
            user_id=user_id,
            post_id=post_id,
            title=title,
            message=message,
            notification_type=notification_type,
            platform=platform,
            is_read=False,
        )

        db.add(notification)
        db.commit()
        db.refresh(notification)

        logger.info(
            "NOTIFICATION CREATED: id=%s user_id=%s type=%s platform=%s",
            notification.id,
            user_id,
            notification_type,
            platform,
        )

        return notification

    except Exception:
        db.rollback()

        logger.exception(
            "NOTIFICATION CREATION FAILED: user_id=%s type=%s platform=%s",
            user_id,
            notification_type,
            platform,
        )

        return None
