"""updated_at_column_deployed_workflow_instance

Revision ID: 36b336fcaf37
Revises: 9dd60fa51a3c
Create Date: 2025-09-05 10:00:16.279645

"""
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36b336fcaf37'
down_revision: Union[str, None] = '9dd60fa51a3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add updated_at column to deployed_workflow_instance table
    def safe_add_column(table, column):
        try:
            op.add_column(table, column)
        except Exception as e:
            print(f"Skipping add_column for {table}.{column.name}: {e}")

    safe_add_column('deployed_workflow_instance', sa.Column('updated_at', sa.DateTime(), nullable=True))
    
    # For existing entries, set updated_at = created_at initially
    conn = op.get_bind()
    
    # Update all existing rows: set updated_at to created_at value where updated_at is null
    # If created_at is also null, use current UTC time
    current_utc_time = datetime.now(timezone.utc)
    
    conn.execute(
        sa.text("""
            UPDATE deployed_workflow_instance 
            SET updated_at = COALESCE(created_at, :current_time) 
            WHERE updated_at IS NULL
        """),
        {"current_time": current_utc_time}
    )


def downgrade() -> None:
    # Remove updated_at column from deployed_workflow_instance table
    # Get database connection to check if we're using SQLite
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    if is_sqlite:
        # For SQLite, recreate table without the updated_at column
        op.execute("""
            CREATE TABLE deployed_workflow_instance_new (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                type VARCHAR,
                status VARCHAR,
                workflow_id VARCHAR NOT NULL,
                cml_deployed_model_id VARCHAR,
                created_at DATETIME,
                deployment_metadata JSON,
                FOREIGN KEY(workflow_id) REFERENCES workflows (id)
            )
        """)
        
        # Copy data from old table (excluding updated_at column)
        op.execute("""
            INSERT INTO deployed_workflow_instance_new (
                id, name, type, status, workflow_id, cml_deployed_model_id,
                created_at, deployment_metadata
            )
            SELECT 
                id, name, type, status, workflow_id, cml_deployed_model_id,
                created_at, deployment_metadata
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

        safe_drop_column('deployed_workflow_instance', 'updated_at')
