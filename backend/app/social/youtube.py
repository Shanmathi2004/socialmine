
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.security.dependencies import get_current_user
from app.models.social_account import SocialAccount


load_dotenv()


# =========================================================
# YouTube OAuth Configuration
# =========================================================

YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID")
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET")
YOUTUBE_REDIRECT_URI = os.getenv("YOUTUBE_REDIRECT_URI")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
)

YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token"

YOUTUBE_USERINFO_URL = (
    "https://www.googleapis.com/oauth2/v3/userinfo"
)

YOUTUBE_API_URL = (
    "https://www.googleapis.com/youtube/v3"
)


# =========================================================
# Router
# =========================================================

router = APIRouter(
    prefix="/api/social/youtube",
    tags=["YouTube"],
)


# =========================================================
# Temporary OAuth State Storage
# =========================================================

oauth_states: dict[str, int] = {}


# =========================================================
# Redirect Helper
# =========================================================

def redirect_to_social_accounts(
    status: str,
    message: str | None = None,
):
    url = (
        f"{FRONTEND_URL}"
        f"/dashboard/social-accounts"
        f"?youtube={status}"
    )

    if message:
        url += f"&message={quote(message)}"

    return RedirectResponse(url=url)


# =========================================================
# Start YouTube OAuth
# =========================================================

@router.get("/login")
def youtube_login(
    current_user=Depends(get_current_user),
):
    if not YOUTUBE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="YOUTUBE_CLIENT_ID is not configured.",
        )

    if not YOUTUBE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="YOUTUBE_CLIENT_SECRET is not configured.",
        )

    if not YOUTUBE_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="YOUTUBE_REDIRECT_URI is not configured.",
        )

    # Create OAuth state
    state = secrets.token_urlsafe(32)

    # Associate state with logged-in SocialPilot user
    oauth_states[state] = current_user.id

    # YouTube / Google OAuth scopes
    scope = " ".join(
        [
            "openid",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
        ]
    )

    params = {
        "client_id": YOUTUBE_CLIENT_ID,
        "redirect_uri": YOUTUBE_REDIRECT_URI,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    login_url = (
        f"{YOUTUBE_AUTH_URL}?"
        f"{urlencode(params)}"
    )

    return {
        "login_url": login_url
    }


# =========================================================
# YouTube OAuth Callback
# =========================================================

@router.get("/callback")
def youtube_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    # -----------------------------------------------------
    # Google returned an OAuth error
    # -----------------------------------------------------

    if error:
        return redirect_to_social_accounts(
            "error",
            error_description or error,
        )

    # -----------------------------------------------------
    # Validate authorization code
    # -----------------------------------------------------

    if not code:
        return redirect_to_social_accounts(
            "error",
            "YouTube authorization code is missing.",
        )

    # -----------------------------------------------------
    # Validate OAuth state
    # -----------------------------------------------------

    if not state:
        return redirect_to_social_accounts(
            "error",
            "YouTube OAuth state is missing.",
        )

    if state not in oauth_states:
        return redirect_to_social_accounts(
            "error",
            "Invalid or expired YouTube OAuth state.",
        )

    user_id = oauth_states.pop(state)

    # -----------------------------------------------------
    # Exchange authorization code for tokens
    # -----------------------------------------------------

    try:
        token_response = requests.post(
            YOUTUBE_TOKEN_URL,
            data={
                "code": code,
                "client_id": YOUTUBE_CLIENT_ID,
                "client_secret": YOUTUBE_CLIENT_SECRET,
                "redirect_uri": YOUTUBE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=30,
        )

    except requests.RequestException:
        return redirect_to_social_accounts(
            "error",
            "Unable to connect to Google.",
        )

    if not token_response.ok:
        return redirect_to_social_accounts(
            "error",
            "YouTube token exchange failed.",
        )

    token_data = token_response.json()

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")

    if not access_token:
        return redirect_to_social_accounts(
            "error",
            "YouTube access token was not returned.",
        )

    # -----------------------------------------------------
    # Calculate token expiry
    # -----------------------------------------------------

    token_expires_at = None

    if expires_in:
        token_expires_at = (
            datetime.now(timezone.utc)
            + timedelta(seconds=int(expires_in))
        )

    # -----------------------------------------------------
    # Get Google profile
    # -----------------------------------------------------

    try:
        userinfo_response = requests.get(
            YOUTUBE_USERINFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}"
            },
            timeout=30,
        )

    except requests.RequestException:
        return redirect_to_social_accounts(
            "error",
            "Unable to retrieve Google profile.",
        )

    if not userinfo_response.ok:
        return redirect_to_social_accounts(
            "error",
            "Unable to retrieve Google profile.",
        )

    userinfo = userinfo_response.json()

    google_user_id = userinfo.get("sub")

    if not google_user_id:
        return redirect_to_social_accounts(
            "error",
            "Google user ID was not returned.",
        )

    google_name = (
        userinfo.get("name")
        or userinfo.get("email")
        or "YouTube User"
    )

    # -----------------------------------------------------
    # Get YouTube channel
    # -----------------------------------------------------

    try:
        channel_response = requests.get(
            f"{YOUTUBE_API_URL}/channels",
            params={
                "part": "snippet",
                "mine": "true",
            },
            headers={
                "Authorization": f"Bearer {access_token}"
            },
            timeout=30,
        )

    except requests.RequestException:
        return redirect_to_social_accounts(
            "error",
            "Unable to retrieve YouTube channel.",
        )

    if not channel_response.ok:
        return redirect_to_social_accounts(
            "error",
            "Unable to retrieve YouTube channel.",
        )

    channel_data = channel_response.json()

    channels = channel_data.get("items", [])

    if not channels:
        return redirect_to_social_accounts(
            "error",
            "No YouTube channel was found for this Google account.",
        )

    channel = channels[0]

    channel_id = channel.get("id")

    snippet = channel.get("snippet", {})

    channel_title = (
        snippet.get("title")
        or google_name
        or "YouTube Channel"
    )

    if not channel_id:
        return redirect_to_social_accounts(
            "error",
            "YouTube channel ID was not returned.",
        )

    # -----------------------------------------------------
    # Check existing YouTube account
    # -----------------------------------------------------

    existing_account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == user_id,
            SocialAccount.platform == "youtube",
            SocialAccount.platform_user_id == channel_id,
        )
        .first()
    )

    # -----------------------------------------------------
    # Update existing account
    # -----------------------------------------------------

    if existing_account:

        existing_account.access_token = access_token

        if refresh_token:
            existing_account.refresh_token = refresh_token

        existing_account.token_expires_at = token_expires_at

        existing_account.platform_username = channel_title

        existing_account.display_name = channel_title

        existing_account.status = "connected"

    # -----------------------------------------------------
    # Create new account
    # -----------------------------------------------------

    else:

        youtube_account = SocialAccount(
            user_id=user_id,
            platform="youtube",
            platform_user_id=channel_id,
            platform_username=channel_title,
            display_name=channel_title,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            status="connected",
        )

        db.add(youtube_account)

    # -----------------------------------------------------
    # Save to database
    # -----------------------------------------------------

    try:
        db.commit()

    except Exception:
        db.rollback()

        return redirect_to_social_accounts(
            "error",
            "Unable to save YouTube account.",
        )

    # -----------------------------------------------------
    # Success
    # -----------------------------------------------------

    return redirect_to_social_accounts(
        "connected",
        "YouTube account connected successfully.",
    )
