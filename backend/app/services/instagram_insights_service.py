
import requests
from datetime import datetime, timezone

from app.models.publishing_log import PublishingLog
from app.models.social_account import SocialAccount


INSTAGRAM_GRAPH_URL = "https://graph.instagram.com/v24.0"


def fetch_instagram_insights(
    db,
    publishing_log: PublishingLog,
):
    """
    Fetch engagement insights for one published
    Instagram media item.
    """

    if publishing_log.platform.lower() != "instagram":
        raise ValueError(
            "Insights are currently supported only for Instagram."
        )

    if not publishing_log.platform_media_id:
        raise ValueError(
            "Instagram media ID is missing."
        )

    social_account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.id == publishing_log.social_account_id
        )
        .first()
    )

    if not social_account:
        raise ValueError(
            "Connected Instagram account not found."
        )

    if not social_account.access_token:
        raise ValueError(
            "Instagram access token is missing."
        )

    url = (
        f"{INSTAGRAM_GRAPH_URL}/"
        f"{publishing_log.platform_media_id}/insights"
    )

    params = {
        "metric": "likes,comments,shares,reach,views",
        "access_token": social_account.access_token,
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=30,
        )
        result = response.json()
    except requests.RequestException as error:
        raise ValueError(
            "Could not connect to Instagram to retrieve post insights."
        ) from error
    except ValueError as error:
        raise ValueError(
            "Instagram returned an invalid post insights response."
        ) from error

    if response.status_code != 200:
        error_data = result.get("error", {})
        error_message = (
            error_data.get("message")
            if isinstance(error_data, dict)
            else None
        )

        raise ValueError(
            error_message
            or "Instagram insights could not be retrieved."
        )

    metrics = {}

    for item in result.get("data", []):
        name = item.get("name")
        values = item.get("values") or []

        if values:
            value = values[0].get("value", 0)
        else:
            value = item.get("total_value", {}).get("value", 0)

        if name:
            metrics[name] = value

    publishing_log.likes = metrics.get("likes", 0)
    publishing_log.comments = metrics.get("comments", 0)
    publishing_log.shares = metrics.get("shares", 0)
    publishing_log.reach = metrics.get("reach", 0)
    publishing_log.views = metrics.get("views", 0)

    try:
        db.commit()
        db.refresh(publishing_log)
    except Exception:
        db.rollback()
        raise

    return {
        "publishing_log_id": publishing_log.id,
        "platform": "instagram",
        "likes": publishing_log.likes,
        "comments": publishing_log.comments,
        "shares": publishing_log.shares,
        "reach": publishing_log.reach,
        "views": publishing_log.views,
    }



def fetch_instagram_account_insights(
    db,
    social_account: SocialAccount,
):
    """
    Fetch the current Instagram follower count from
    the account profile fields and save a snapshot.
    """

    if (social_account.platform or "").lower() != "instagram":
        raise ValueError(
            "Audience insights are currently supported only for Instagram."
        )

    if not social_account.access_token:
        raise ValueError("Instagram access token is missing.")

    if not social_account.platform_user_id:
        raise ValueError("Instagram account ID is missing.")

    url = (
        f"{INSTAGRAM_GRAPH_URL}/"
        f"{social_account.platform_user_id}"
    )

    params = {
        "fields": "followers_count",
        "access_token": social_account.access_token,
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=30,
        )
    except requests.RequestException as error:
        raise ValueError(
            "Could not connect to Instagram to retrieve follower data."
        ) from error

    try:
        result = response.json()
    except ValueError as error:
        raise ValueError(
            "Instagram returned an invalid response."
        ) from error

    if response.status_code != 200:
        error_data = result.get("error", {})
        message = (
            error_data.get("message")
            if isinstance(error_data, dict)
            else None
        )
        raise ValueError(
            message or "Instagram follower data could not be retrieved."
        )

    follower_count = result.get("followers_count")

    if follower_count is None:
        raise ValueError(
            "Instagram did not return followers_count. "
            "Verify the account ID, API login type, and token permissions."
        )

    try:
        follower_count = int(follower_count)
    except (TypeError, ValueError) as error:
        raise ValueError(
            "Instagram returned an invalid follower count."
        ) from error

    if follower_count < 0:
        raise ValueError("Instagram returned an invalid follower count.")

    old_count = social_account.followers_count or 0

    if social_account.followers_updated_at is None:
        # First successful request establishes the baseline.
        social_account.followers_count = follower_count
        social_account.previous_followers_count = follower_count
    elif follower_count != old_count:
        social_account.previous_followers_count = old_count
        social_account.followers_count = follower_count

    social_account.followers_updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(social_account)
    except Exception:
        db.rollback()
        raise

    return {
        "social_account_id": social_account.id,
        "platform": "instagram",
        "followers_count": social_account.followers_count,
        "previous_followers_count": social_account.previous_followers_count,
        "follower_change": (
            social_account.followers_count
            - social_account.previous_followers_count
        ),
        "followers_updated_at": (
            social_account.followers_updated_at.isoformat()
            if social_account.followers_updated_at
            else None
        ),
    }
