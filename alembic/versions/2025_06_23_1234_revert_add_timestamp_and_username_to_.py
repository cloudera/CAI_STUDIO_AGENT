"""revert_add_timestamp_and_username_to_workflow

Revision ID: 980d1dbdd930
Revises: 9f41faf9c37a
Create Date: 2025-06-23 12:34:47.468718

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '980d1dbdd930'
down_revision: Union[str, None] = '9f41faf9c37a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite doesn't support DROP COLUMN in older versions, so we'll recreate the tables
    # without the timestamp and username columns
    
    # Get database connection to check if we're using SQLite
    conn = op.get_bind()
    is_sqlite = conn.dialect.name == 'sqlite'
    
    if is_sqlite:
        # For SQLite, recreate tables without the columns we want to remove
        
        # Recreate workflows table without timestamp/username columns
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
                is_draft BOOLEAN,
                directory VARCHAR
            )
        """)
        
        # Copy data from old table (only the columns that exist in new table)
        op.execute("""
            INSERT INTO workflows_new (
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory
            )
            SELECT 
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory 
            FROM workflows
        """)
        
        # Drop old table and rename new one
        op.drop_table('workflows')
        op.execute("ALTER TABLE workflows_new RENAME TO workflows")
        
        # Recreate workflow_templates table without timestamp/username columns
        op.execute("""
            CREATE TABLE workflow_templates_new (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                description VARCHAR,
                process TEXT,
                agent_template_ids JSON,
                task_template_ids JSON,
                manager_agent_template_id VARCHAR,
                use_default_manager BOOLEAN,
                is_conversational BOOLEAN,
                pre_packaged BOOLEAN
            )
        """)
        
        # Copy data from old table (only the columns that exist in new table)
        op.execute("""
            INSERT INTO workflow_templates_new (
                id, name, description, process, agent_template_ids, task_template_ids,
                manager_agent_template_id, use_default_manager, is_conversational, pre_packaged
            )
            SELECT 
                id, name, description, process, agent_template_ids, task_template_ids,
                manager_agent_template_id, use_default_manager, is_conversational, pre_packaged
            FROM workflow_templates
        """)
        
        # Drop old table and rename new one
        op.drop_table('workflow_templates')
        op.execute("ALTER TABLE workflow_templates_new RENAME TO workflow_templates")
        
    else:
        # For other databases (PostgreSQL, MySQL, etc.), use standard DROP COLUMN
        def safe_drop_column(table, column):
            try:
                op.drop_column(table, column)
            except Exception as e:
                print(f"Skipping drop_column for {table}.{column}: {e}")

        safe_drop_column('workflows', 'updated_by_username')
        safe_drop_column('workflows', 'created_by_username')
        safe_drop_column('workflows', 'updated_at')
        safe_drop_column('workflows', 'created_at')
        safe_drop_column('workflow_templates', 'updated_by_username')
        safe_drop_column('workflow_templates', 'created_by_username')
        safe_drop_column('workflow_templates', 'updated_at')
        safe_drop_column('workflow_templates', 'created_at')


def downgrade() -> None:
    # If we need to downgrade this revert, re-add the columns
    # Helper to add a column if it doesn't exist (best effort for SQLite/dev)
    def safe_add_column(table, column):
        try:
            op.add_column(table, column)
        except Exception as e:
            print(f"Skipping add_column for {table}.{column.name}: {e}")

    # Try to add columns, skip if they already exist
    safe_add_column('workflow_templates', sa.Column('created_at', sa.DateTime(), nullable=True))
    safe_add_column('workflow_templates', sa.Column('updated_at', sa.DateTime(), nullable=True))
    safe_add_column('workflow_templates', sa.Column('created_by_username', sa.String(), nullable=True))
    safe_add_column('workflow_templates', sa.Column('updated_by_username', sa.String(), nullable=True))
    safe_add_column('workflows', sa.Column('created_at', sa.DateTime(), nullable=True))
    safe_add_column('workflows', sa.Column('updated_at', sa.DateTime(), nullable=True))
    safe_add_column('workflows', sa.Column('created_by_username', sa.String(), nullable=True))
    safe_add_column('workflows', sa.Column('updated_by_username', sa.String(), nullable=True))

    # Set default values for workflows
    op.execute(
        """
        UPDATE workflows
        SET created_by_username = COALESCE(created_by_username, 'Unknown'),
            updated_by_username = COALESCE(updated_by_username, 'Unknown'),
            created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        """
    )

    # Set default values for workflow_templates
    # For pre_packaged = 1 (True), set to 'Cloudera', else 'Unknown'
    op.execute(
        """
        UPDATE workflow_templates
        SET created_by_username = 
            CASE 
                WHEN pre_packaged = 1 THEN 'Cloudera'
                ELSE COALESCE(created_by_username, 'Unknown')
            END,
            updated_by_username = 
            CASE 
                WHEN pre_packaged = 1 THEN 'Cloudera'
                ELSE COALESCE(updated_by_username, 'Unknown')
            END,
            created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        """
    )
