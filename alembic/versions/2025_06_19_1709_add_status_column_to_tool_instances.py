"""Add status column to tool instances

Revision ID: 9f41faf9c37a
Revises: ebf7f8932aa4
Create Date: 2025-06-19 17:09:10.740139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f41faf9c37a'
down_revision: Union[str, None] = 'ebf7f8932aa4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # Add status column with default value 'CREATED'
    try:
        op.execute("ALTER TABLE tool_instances ADD COLUMN status VARCHAR NOT NULL DEFAULT 'CREATED'")
    except Exception as e:
        print(f"Column 'status' might already exist: {e}")
    # ### end Alembic commands ###


def downgrade() -> None:
    # Drop status column
    try:
        op.execute("ALTER TABLE tool_instances DROP COLUMN status")
    except Exception as e:
        print(f"Column 'status' might already be dropped: {e}")
    # ### end Alembic commands ###
