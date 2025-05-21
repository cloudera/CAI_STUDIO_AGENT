"""add workflow template support for MCP

Revision ID: c6e8ae65d72c
Revises: bc6831e63a9e
Create Date: 2025-05-19 19:00:37.939397

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6e8ae65d72c'
down_revision: Union[str, None] = 'bc6831e63a9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.add_column('agent_templates', sa.Column('mcp_template_ids', sa.JSON(), nullable=True))
        op.add_column('mcp_templates', sa.Column('workflow_template_id', sa.String(), nullable=True))
    except Exception as e:
        print("Column probably already exists: ", e)
    

def downgrade() -> None:
    try:
        op.drop_column('agent_templates', 'mcp_template_ids')
        op.drop_column('mcp_templates', 'workflow_template_id')
    except Exception as e:
        print("Column probably already deleted: ", e)
    
