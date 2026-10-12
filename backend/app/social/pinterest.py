
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import os
import secrets

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.social_account import SocialAccount
from app.models.user import User
from app.security.dependencies import get_current_user


load_dotenv()


# ---------------------------------------------------------
# Pinterest configuration
# ---------------------------------------------------------

PINTEREST_APP_ID = os.getenv("PINTEREST_APP_ID")
PINTEREST_APP_SECRET = os.getenv("PINTEREST_APP_SECRET")
PINTEREST_REDIRECT_URI = os.getenv("PINTEREST_REDIRECT_URI")

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
)


# ---------------------------------------------------------
# Router
# ---------------------------------------------------------

router = APIRouter(
    prefix="/api/social/pinterest",
    tags=["Pinterest"],
)


# state -> {"user_id": int, "return_to": str}
oauth_states = {}


# ---------------------------------------------------------
# Redirect helper
# ---------------------------------------------------------

def redirect_to_frontend(
    status: str,
    message: str,
    return_to: str = "/dashboard",
):
    # Only allow internal SocialPilot dashboard paths.
    if not return_to.startswith("/dashboard"):
        return_to = "/dashboard"

    query = urlencode(
        {
            "pinterest": status,
            "message": message,
        }
    )

    return RedirectResponse(
        url=f"{FRONTEND_URL}{return_to}?{query}"
    )


# ---------------------------------------------------------
# Configuration test
# ---------------------------------------------------------

@router.get("/config-test")
def pinterest_config_test():
    return {
        "app_id_loaded": bool(PINTEREST_APP_ID),
        "app_secret_loaded": bool(PINTEREST_APP_SECRET),
        "redirect_uri_loaded": bool(PINTEREST_REDIRECT_URI),
    }


# ---------------------------------------------------------
# Start Pinterest OAuth
# ---------------------------------------------------------

@router.get("/login")
def pinterest_login(
    return_to: str = "/dashboard",
    current_user: User = Depends(get_current_user),
):
    # Only allow dashboard pages as return locations.
    if not return_to.startswith("/dashboard"):
        return_to = "/dashboard"

    # Make sure required configuration exists.
    if not PINTEREST_APP_ID:
        return redirect_to_frontend(
            "error",
            "Pinterest connection failed: PINTEREST_APP_ID is missing.",
            return_to,
        )

    if not PINTEREST_REDIRECT_URI:
        return redirect_to_frontend(
            "error",
            "Pinterest connection failed: PINTEREST_REDIRECT_URI is missing.",
            return_to,
        )

    # Generate CSRF protection state.
    state = secrets.token_urlsafe(32)

    oauth_states[state] = {
        "user_id": current_user.id,
        "return_to": return_to,
    }

    # Permissions required by SocialPilot.
    scopes = (
        "user_accounts:read,"
        "boards:read,"
        "boards:write,"
        "pins:read,"
        "pins:write"
    )

    params = {
        "client_id": PINTEREST_APP_ID,
        "redirect_uri": PINTEREST_REDIRECT_URI,
        "response_type": "code",
        "scope": scopes,
        "state": state,
    }

    pinterest_url = (
        "https://www.pinterest.com/oauth/?"
        + urlencode(params)
    )

    return {
        "login_url": pinterest_url,
        "state": state,
    }


# ---------------------------------------------------------
# Pinterest OAuth callback
# ---------------------------------------------------------

@router.get("/callback")
def pinterest_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    state = request.query_params.get("state")
    code = request.query_params.get("code")

    error = request.query_params.get("error")
    error_description = request.query_params.get(
        "error_description"
    )

    # -----------------------------------------------------
    # 1. Handle Pinterest OAuth errors
    # -----------------------------------------------------

    if error:
        oauth_data = (
            oauth_states.pop(state, None)
            if state
            else None
        )

        return_to = (
            oauth_data.get("return_to")
            if oauth_data
            else "/dashboard"
        )

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                f"{error_description or error}"
            ),
            return_to,
        )

    # -----------------------------------------------------
    # 2. Validate state
    # -----------------------------------------------------

    if not state:
        return redirect_to_frontend(
            "error",
            "Pinterest connection failed: OAuth state was not received.",
        )

    oauth_data = oauth_states.get(state)

    if not oauth_data:
        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "the authorization session expired or was invalid."
            ),
        )

    user_id = oauth_data["user_id"]

    return_to = oauth_data.get(
        "return_to",
        "/dashboard",
    )

    # -----------------------------------------------------
    # 3. Validate authorization code
    # -----------------------------------------------------

    if not code:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "authorization was not completed."
            ),
            return_to,
        )

    # -----------------------------------------------------
    # 4. Validate app credentials
    # -----------------------------------------------------

    if not PINTEREST_APP_ID:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            "Pinterest connection failed: PINTEREST_APP_ID is missing.",
            return_to,
        )

    if not PINTEREST_APP_SECRET:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "PINTEREST_APP_SECRET is missing."
            ),
            return_to,
        )

    if not PINTEREST_REDIRECT_URI:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "PINTEREST_REDIRECT_URI is missing."
            ),
            return_to,
        )

    # -----------------------------------------------------
    # 5. Exchange authorization code for access token
    # -----------------------------------------------------

    token_url = "https://api.pinterest.com/v5/oauth/token"

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": PINTEREST_REDIRECT_URI,
    }

    try:
        token_response = requests.post(
            token_url,
            data=token_data,
            auth=(
                PINTEREST_APP_ID,
                PINTEREST_APP_SECRET,
            ),
            headers={
                "Content-Type":
                    "application/x-www-form-urlencoded",
            },
            timeout=15,
        )

    except requests.RequestException:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "unable to contact Pinterest."
            ),
            return_to,
        )

    if token_response.status_code != 200:
        oauth_states.pop(state, None)

        try:
            token_error = token_response.json()

            error_message = (
                token_error.get("message")
                or token_error.get("error")
                or token_error.get("error_description")
            )

        except ValueError:
            error_message = None

        return redirect_to_frontend(
            "error",
            (
                error_message
                or "Pinterest rejected the authorization request."
            ),
            return_to,
        )

    try:
        token_data_response = token_response.json()

    except ValueError:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "invalid token response was received."
            ),
            return_to,
        )

    pinterest_access_token = token_data_response.get(
        "access_token"
    )

    pinterest_refresh_token = token_data_response.get(
        "refresh_token"
    )

    expires_in = token_data_response.get(
        "expires_in"
    )

    if not pinterest_access_token:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "Pinterest did not provide an access token."
            ),
            return_to,
        )

    # -----------------------------------------------------
    # 6. Calculate access-token expiry
    # -----------------------------------------------------

    token_expires_at = None

    if expires_in:
        token_expires_at = (
            datetime.now(timezone.utc)
            + timedelta(
                seconds=int(expires_in)
            )
        )

    # -----------------------------------------------------
    # 7. Get Pinterest account information
    # -----------------------------------------------------

    account_url = (
        "https://api.pinterest.com/v5/user_account"
    )

    try:
        account_response = requests.get(
            account_url,
            headers={
                "Authorization":
                    f"Bearer {pinterest_access_token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

    except requests.RequestException:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "unable to retrieve your Pinterest account."
            ),
            return_to,
        )

    if account_response.status_code != 200:
        oauth_states.pop(state, None)

        try:
            account_error = account_response.json()

            error_message = (
                account_error.get("message")
                or account_error.get("error")
            )

        except ValueError:
            error_message = None

        return redirect_to_frontend(
            "error",
            (
                error_message
                or (
                    "Pinterest could not provide "
                    "your account information."
                )
            ),
            return_to,
        )

    try:
        account_data = account_response.json()

    except ValueError:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "invalid account information was received."
            ),
            return_to,
        )

    pinterest_user_id = account_data.get("id")
    pinterest_username = account_data.get("username")
    business_name = account_data.get("business_name")

    if not pinterest_user_id:
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest connection failed: "
                "Pinterest account ID was not returned."
            ),
            return_to,
        )

    pinterest_user_id = str(
        pinterest_user_id
    )

    display_name = (
        business_name
        or pinterest_username
        or "Pinterest Account"
    )

    # -----------------------------------------------------
    # 8. Save / update Pinterest account
    # -----------------------------------------------------

    try:
        existing_account = (
            db.query(SocialAccount)
            .filter(
                SocialAccount.user_id == user_id,
                SocialAccount.platform == "pinterest",
                SocialAccount.platform_user_id
                == pinterest_user_id,
            )
            .first()
        )

        if existing_account:

            existing_account.platform_username = (
                pinterest_username
            )

            existing_account.display_name = (
                display_name
            )

            existing_account.access_token = (
                pinterest_access_token
            )

            if pinterest_refresh_token:
                existing_account.refresh_token = (
                    pinterest_refresh_token
                )

            existing_account.token_expires_at = (
                token_expires_at
            )

            existing_account.status = "connected"

            db.commit()
            db.refresh(existing_account)

        else:

            new_account = SocialAccount(
                user_id=user_id,
                platform="pinterest",
                platform_user_id=pinterest_user_id,
                platform_username=pinterest_username,
                display_name=display_name,
                access_token=pinterest_access_token,
                refresh_token=pinterest_refresh_token,
                token_expires_at=token_expires_at,
                status="connected",
            )

            db.add(new_account)

            db.commit()
            db.refresh(new_account)

    except Exception:
        db.rollback()
        oauth_states.pop(state, None)

        return redirect_to_frontend(
            "error",
            (
                "Pinterest account was authorized, "
                "but SocialPilot could not save the account."
            ),
            return_to,
        )

    # -----------------------------------------------------
    # 9. Remove OAuth state
    # -----------------------------------------------------

    oauth_states.pop(state, None)

    # -----------------------------------------------------
    # 10. Return to dashboard
    # -----------------------------------------------------

    return redirect_to_frontend(
        "connected",
        "Pinterest account connected successfully.",
        return_to,
    )
