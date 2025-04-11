"""Add venv tool field option to tool templates and tool instances

Revision ID: 3fa293c89b1b
Revises: 59fbac3b744e
Create Date: 2025-04-08 23:17:39.659781

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3fa293c89b1b'
down_revision: Union[str, None] = '59fbac3b744e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.add_column('tool_instances', sa.Column('is_venv_tool', sa.Boolean(), nullable=True))
        op.add_column('tool_templates', sa.Column('is_venv_tool', sa.Boolean(), nullable=True))
    except Exception as e:
        print("is_venv_tool column already added!")


def downgrade() -> None:
    try:
        op.drop_column('tool_templates', 'is_venv_tool')
        op.drop_column('tool_instances', 'is_venv_tool')
    except Exception as e:
        print("is_venv_tool column already removed!")
