from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.post import Post


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    post_id: int | None = None,
    platform: str | None = None,
):
    """
    Add a notification to the current database transaction.

    The caller is responsible for committing the transaction.
    """
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
    return notification


def notify_publishing_result(
    db: Session,
    post: Post,
    platform: str,
    success: bool,
    error_message: str | None = None,
):
    platform_name = platform.capitalize()

    if success:
        create_notification(
            db=db,
            user_id=post.user_id,
            post_id=post.id,
            title="Post published successfully",
            message=(
                f"Your post #{post.id} was published "
                f"successfully on {platform_name}."
            ),
            notification_type="publish_success",
            platform=platform,
        )
        return

    message = (
        f"Your post #{post.id} could not be published "
        f"on {platform_name}."
    )

    if error_message:
        message += f" Reason: {error_message[:500]}"

    create_notification(
        db=db,
        user_id=post.user_id,
        post_id=post.id,
        title="Post publishing failed",
        message=message,
        notification_type="publish_failure",
        platform=platform,
    )


def create_scheduled_reminder(
    db: Session,
    post: Post,
    reminder_before_minutes: int = 30,
):
    """
    Create one reminder per post and reminder window.

    A reminder is skipped if an existing scheduled_reminder
    notification for the same post was created in the window.
    """
    if not post.scheduled_at:
        return False

    now = datetime.now(timezone.utc)
    scheduled_at = post.scheduled_at

    # Handle timestamps returned without timezone information.
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    reminder_time = scheduled_at - timedelta(
        minutes=reminder_before_minutes
    )

    if now < reminder_time or now >= scheduled_at:
        return False

    # Avoid generating a reminder repeatedly during scheduler runs.
    reminder_window_start = reminder_time - timedelta(minutes=1)
    reminder_window_end = reminder_time + timedelta(minutes=1)

    existing = (
        db.query(Notification.id)
        .filter(
            Notification.user_id == post.user_id,
            Notification.post_id == post.id,
            Notification.notification_type == "scheduled_reminder",
            Notification.created_at >= reminder_window_start,
            Notification.created_at <= reminder_window_end,
        )
        .first()
    )

    if existing:
        return False

    create_notification(
        db=db,
        user_id=post.user_id,
        post_id=post.id,
        title="Your post is scheduled soon",
        message=(
            f"Post #{post.id} is scheduled to publish "
            f"at {scheduled_at.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}."
        ),
        notification_type="scheduled_reminder",
    )

    return True