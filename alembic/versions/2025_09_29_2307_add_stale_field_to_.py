"""add stale field to DeployedWorkflowInstance

Revision ID: ae5e1dd6afb6
Revises: 36b336fcaf37
Create Date: 2025-09-29 23:07:56.719567

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ae5e1dd6afb6'
down_revision: Union[str, None] = '36b336fcaf37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add stale column to deployed_workflow_instance table
    def safe_add_column(table, column):
        try:
            op.add_column(table, column)
        except Exception as e:
            print(f"Skipping add_column for {table}.{column.name}: {e}")

    safe_add_column('deployed_workflow_instance', sa.Column('stale', sa.Boolean(), default=True, nullable=True))
    
    # For existing entries, set stale = True (default behavior)
    conn = op.get_bind()
    
    # Update all existing rows: set stale to True where stale is null
    conn.execute(
        sa.text("""
            UPDATE deployed_workflow_instance 
            SET stale = :default_value 
            WHERE stale IS NULL
        """),
        {"default_value": True}
    )


def downgrade() -> None:
    # Remove stale column from deployed_workflow_instance table
    # Get database connection to check if we're using SQLite
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    if is_sqlite:
        # For SQLite, recreate table without the stale column
        op.execute("""
            CREATE TABLE deployed_workflow_instance_new (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                type VARCHAR,
                status VARCHAR,
                workflow_id VARCHAR NOT NULL,
                cml_deployed_model_id VARCHAR,
                created_at DATETIME,
                updated_at DATETIME,
                deployment_metadata JSON,
                FOREIGN KEY(workflow_id) REFERENCES workflows (id)
            )
        """)
        
        # Copy data from old table (excluding stale column)
        op.execute("""
            INSERT INTO deployed_workflow_instance_new (
                id, name, type, status, workflow_id, cml_deployed_model_id,
                created_at, updated_at, deployment_metadata
            )
            SELECT 
                id, name, type, status, workflow_id, cml_deployed_model_id,
                created_at, updated_at, deployment_metadata
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

        safe_drop_column('deployed_workflow_instance', 'stale')
