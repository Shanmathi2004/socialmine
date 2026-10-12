
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4cf4243b1b15"
down_revision: Union[str, Sequence[str], None] = "575385b74003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Restore the removed posts columns
    op.add_column("posts", sa.Column("title", sa.String(500), nullable=True))
    op.add_column("posts", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("posts", sa.Column("destination_url", sa.Text(), nullable=True))
    op.add_column("posts", sa.Column("visibility", sa.String(50), nullable=True))
    op.add_column(
        "posts",
        sa.Column(
            "media_items",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "posts",
        sa.Column(
            "post_type",
            sa.String(50),
            nullable=False,
            server_default="text",
        ),
    )
    op.add_column("posts", sa.Column("media_type", sa.String(50), nullable=True))

    # Create notifications table
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "post_id",
            sa.Integer(),
            sa.ForeignKey("posts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("platform", sa.String(50), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_post_id", "notifications", ["post_id"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])


def downgrade() -> None:
    op.drop_index("ix_notifications_is_read", table_name="notifications")
    op.drop_index("ix_notifications_post_id", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")

    op.drop_column("posts", "media_type")
    op.drop_column("posts", "post_type")
    op.drop_column("posts", "media_items")
    op.drop_column("posts", "visibility")
    op.drop_column("posts", "destination_url")
    op.drop_column("posts", "description")
    op.drop_column("posts", "title")
