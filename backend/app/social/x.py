
import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.connection import get_db
from app.dependencies import get_current_user
from app.models.social_account import SocialAccount


load_dotenv()


router = APIRouter(
    prefix="/api/social/x",
    tags=["X / Twitter"],
)


# ============================================================
# X CONFIGURATION
# ============================================================

X_CLIENT_ID = os.getenv("X_CLIENT_ID")
X_CLIENT_SECRET = os.getenv("X_CLIENT_SECRET")
X_REDIRECT_URI = os.getenv("X_REDIRECT_URI")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
)


# ============================================================
# TEMPORARY OAUTH STORAGE
# ============================================================

oauth_states = {}


# ============================================================
# PKCE HELPERS
# ============================================================

def create_code_verifier():
    return secrets.token_urlsafe(64)


def create_code_challenge(code_verifier: str):
    digest = hashlib.sha256(
        code_verifier.encode("utf-8")
    ).digest()

    return (
        base64.urlsafe_b64encode(digest)
        .decode("utf-8")
        .rstrip("=")
    )


# ============================================================
# CONFIG TEST
# ============================================================

@router.get("/config-test")
def config_test():

    return {
        "client_id_configured": bool(X_CLIENT_ID),
        "client_secret_configured": bool(X_CLIENT_SECRET),
        "redirect_uri": X_REDIRECT_URI,
    }


# ============================================================
# LOGIN
# ============================================================

@router.get("/login")
def x_login(
    current_user=Depends(get_current_user),
):

    if not X_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="X_CLIENT_ID is not configured.",
        )

    if not X_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="X_REDIRECT_URI is not configured.",
        )

    # --------------------------------------------------------
    # STATE
    # --------------------------------------------------------

    state = secrets.token_urlsafe(32)

    # --------------------------------------------------------
    # PKCE
    # --------------------------------------------------------

    code_verifier = create_code_verifier()
    code_challenge = create_code_challenge(code_verifier)

    oauth_states[state] = {
        "user_id": current_user.id,
        "code_verifier": code_verifier,
        "created_at": datetime.now(timezone.utc),
    }

    # --------------------------------------------------------
    # X OAUTH 2.0 SCOPES
    # --------------------------------------------------------

    scopes = [
        "tweet.read",
        "tweet.write",
        "users.read",
        "offline.access",
    ]

    params = {
        "response_type": "code",
        "client_id": X_CLIENT_ID,
        "redirect_uri": X_REDIRECT_URI,
        "scope": " ".join(scopes),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }

    authorization_url = (
        "https://x.com/i/oauth2/authorize?"
        + urlencode(params)
    )

    return RedirectResponse(
        url=authorization_url
    )


# ============================================================
# CALLBACK
# ============================================================

@router.get("/callback")
def x_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # X ERROR
    # --------------------------------------------------------

    if error:
        message = error_description or error

        return RedirectResponse(
            url=(
                f"{FRONTEND_URL}/dashboard"
                f"?x=error"
                f"&message={message}"
            )
        )

    # --------------------------------------------------------
    # VALIDATE PARAMETERS
    # --------------------------------------------------------

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Authorization code missing.",
        )

    if not state:
        raise HTTPException(
            status_code=400,
            detail="OAuth state missing.",
        )

    # --------------------------------------------------------
    # GET STORED STATE
    # --------------------------------------------------------

    oauth_data = oauth_states.pop(state, None)

    if not oauth_data:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state.",
        )

    # --------------------------------------------------------
    # CHECK STATE AGE
    # --------------------------------------------------------

    created_at = oauth_data["created_at"]

    if (
        datetime.now(timezone.utc) - created_at
        > timedelta(minutes=10)
    ):
        raise HTTPException(
            status_code=400,
            detail="OAuth state expired. Please try again.",
        )

    user_id = oauth_data["user_id"]
    code_verifier = oauth_data["code_verifier"]

    # ========================================================
    # EXCHANGE AUTHORIZATION CODE FOR TOKEN
    # ========================================================

    token_url = "https://api.x.com/2/oauth2/token"

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": X_REDIRECT_URI,
        "code_verifier": code_verifier,
    }

    try:

        response = requests.post(
            token_url,
            data=token_data,
            auth=(
                X_CLIENT_ID,
                X_CLIENT_SECRET,
            ),
            headers={
                "Content-Type": (
                    "application/x-www-form-urlencoded"
                )
            },
            timeout=30,
        )

    except requests.RequestException as exc:

        raise HTTPException(
            status_code=502,
            detail=f"X token request failed: {exc}",
        )

    if response.status_code != 200:

        raise HTTPException(
            status_code=400,
            detail={
                "message": "X token exchange failed.",
                "response": response.text,
            },
        )

    token_response = response.json()

    access_token = token_response.get(
        "access_token"
    )

    refresh_token = token_response.get(
        "refresh_token"
    )

    expires_in = token_response.get(
        "expires_in"
    )

    if not access_token:

        raise HTTPException(
            status_code=400,
            detail="X access token was not returned.",
        )

    # ========================================================
    # GET X USER
    # ========================================================

    user_response = requests.get(
        "https://api.x.com/2/users/me",
        headers={
            "Authorization": f"Bearer {access_token}"
        },
        timeout=30,
    )

    if user_response.status_code != 200:

        raise HTTPException(
            status_code=400,
            detail={
                "message": "Unable to retrieve X user.",
                "response": user_response.text,
            },
        )

    user_data = user_response.json().get(
        "data",
        {},
    )

    x_user_id = user_data.get("id")
    username = user_data.get("username")
    name = user_data.get("name")

    if not x_user_id:

        raise HTTPException(
            status_code=400,
            detail="X user ID was not returned.",
        )

    # ========================================================
    # TOKEN EXPIRATION
    # ========================================================

    token_expires_at = None

    if expires_in:

        token_expires_at = (
            datetime.now(timezone.utc)
            + timedelta(
                seconds=int(expires_in)
            )
        )

    # ========================================================
    # SAVE / UPDATE SOCIAL ACCOUNT
    # ========================================================

    social_account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.user_id == user_id,
            SocialAccount.platform == "x",
            SocialAccount.platform_user_id == x_user_id,
        )
        .first()
    )

    if social_account:

        social_account.platform_username = username
        social_account.display_name = name
        social_account.access_token = access_token
        social_account.refresh_token = refresh_token
        social_account.token_expires_at = token_expires_at
        social_account.status = "connected"

    else:

        social_account = SocialAccount(
            user_id=user_id,
            platform="x",
            platform_user_id=x_user_id,
            platform_username=username,
            display_name=name,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            status="connected",
        )

        db.add(social_account)

    db.commit()

    # ========================================================
    # REDIRECT TO DASHBOARD
    # ========================================================

    return RedirectResponse(
        url=(
            f"{FRONTEND_URL}/dashboard"
            f"?x=connected"
            f"&username={username}"
        )
    )

