"""add mcp support

Revision ID: bc6831e63a9e
Revises: 3fa293c89b1b
Create Date: 2025-05-05 23:35:39.690321

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bc6831e63a9e'
down_revision: Union[str, None] = '3fa293c89b1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mcp_templates',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('args', sa.JSON(), nullable=False),
        sa.Column('env_names', sa.JSON(), nullable=False),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='VALIDATING'),
        sa.Column('mcp_image_path', sa.Text(), nullable=False),
        if_not_exists=True,
    )
    op.create_table(
        'mcp_instances',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('workflow_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('args', sa.JSON(), nullable=False),
        sa.Column('env_names', sa.JSON(), nullable=False),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('activated_tools', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='VALIDATING'),
        sa.Column('mcp_image_path', sa.Text(), nullable=False),
        if_not_exists=True,
    )
    op.add_column('agents', sa.Column('mcp_instance_ids', sa.JSON(), nullable=True))

def downgrade() -> None:
    op.drop_table('mcp_templates')
    op.drop_table('mcp_instances')
    op.drop_column('agents', 'mcp_instance_ids')
