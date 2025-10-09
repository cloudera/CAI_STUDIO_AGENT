"""add_created_at_to_deployed_workflow

Revision ID: a1b2c3d4e5f6
Revises: 980d1dbdd930
Create Date: 2025-01-14 15:00:00.000000

"""
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '980d1dbdd930'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add created_at column to deployed_workflow_instance table
    def safe_add_column(table, column):
        try:
            op.add_column(table, column)
        except Exception as e:
            print(f"Skipping add_column for {table}.{column.name}: {e}")

    safe_add_column('deployed_workflow_instance', sa.Column('created_at', sa.DateTime(), nullable=True))
    
    # Prefill created_at column with current UTC datetime for existing rows
    conn = op.get_bind()
    current_utc_time = datetime.now(timezone.utc)
    
    # Update all existing rows that have null created_at values
    conn.execute(
        sa.text("UPDATE deployed_workflow_instance SET created_at = :current_time WHERE created_at IS NULL"),
        {"current_time": current_utc_time}
    )


def downgrade() -> None:
    # Remove created_at column from deployed_workflow_instance table
    # Get database connection to check if we're using SQLite
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    if is_sqlite:
        # For SQLite, recreate table without the created_at column
        op.execute("""
            CREATE TABLE deployed_workflow_instance_new (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                type VARCHAR,
                status VARCHAR,
                workflow_id VARCHAR NOT NULL,
                cml_deployed_model_id VARCHAR,
                is_stale BOOLEAN,
                deployment_metadata JSON,
                FOREIGN KEY(workflow_id) REFERENCES workflows (id)
            )
        """)
        
        # Copy data from old table (excluding created_at column)
        op.execute("""
            INSERT INTO deployed_workflow_instance_new (
                id, name, type, status, workflow_id, cml_deployed_model_id,
                is_stale, deployment_metadata
            )
            SELECT 
                id, name, type, status, workflow_id, cml_deployed_model_id,
                is_stale, deployment_metadata
            FROM deployed_workflow_instance
        """)
        
        # Drop old table and rename new one
        op.drop_table('deployed_workflow_instance')
        op.execute("ALTER TABLE deployed_workflow_instance_new RENAME TO deployed_workflow_instance")
        
    else:
        # For other databases (PostgreSQL, MySQL, etc.), use standard DROP COLUMN
        def safe_drop_column(table, column):
            try:
                op.drop_column(table, column)
            except Exception as e:
                print(f"Skipping drop_column for {table}.{column}: {e}")

        safe_drop_column('deployed_workflow_instance', 'created_at')
