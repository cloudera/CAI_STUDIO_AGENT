"""drop is_draft from workflow table

Revision ID: 9dd60fa51a3c
Revises: a1b2c3d4e5f6
Create Date: 2025-08-13 15:26:44.767945

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9dd60fa51a3c'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Get database connection to check if we're using SQLite
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    if is_sqlite:
        # For SQLite, recreate tables without the columns we want to remove
        
        # Recreate workflows table without is_draft column
        op.execute("""
            CREATE TABLE workflows_new (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                description VARCHAR,
                crew_ai_process TEXT,
                crew_ai_agents JSON,
                crew_ai_tasks JSON,
                crew_ai_manager_agent VARCHAR,
                crew_ai_llm_provider_model_id VARCHAR,
                is_conversational BOOLEAN,
                directory VARCHAR
            )
        """)
        
        # Copy data from old table (excluding is_draft column)
        op.execute("""
            INSERT INTO workflows_new (
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, directory
            )
            SELECT 
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, directory
            FROM workflows
        """)
        
        # Drop old table and rename new one
        op.drop_table('workflows')
        op.execute("ALTER TABLE workflows_new RENAME TO workflows")
        
        # Recreate deployed_workflow_instance table without is_stale column
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
        
        # Copy data from old table (excluding is_stale column)
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

        safe_drop_column('workflows', 'is_draft')
        safe_drop_column('deployed_workflow_instance', 'is_stale')


def downgrade() -> None:
    # If we need to downgrade, re-add the columns
    # Helper to add a column if it doesn't exist (best effort for SQLite/dev)
    def safe_add_column(table, column):
        try:
            op.add_column(table, column)
        except Exception as e:
            print(f"Skipping add_column for {table}.{column.name}: {e}")

    # Try to add columns, skip if they already exist
    safe_add_column('workflows', sa.Column('is_draft', sa.Boolean(), nullable=True))
    safe_add_column('deployed_workflow_instance', sa.Column('is_stale', sa.Boolean(), nullable=True))
