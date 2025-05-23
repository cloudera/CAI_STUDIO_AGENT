"""Schema changes for deployments as jobs

Revision ID: b70a3a5073c4
Revises: c6e8ae65d72c
Create Date: 2025-05-23 12:37:47.254379

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b70a3a5073c4'
down_revision: Union[str, None] = 'c6e8ae65d72c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        # Add new columns directly
        op.execute("ALTER TABLE deployed_workflow_instance ADD COLUMN type VARCHAR")
        op.execute("ALTER TABLE deployed_workflow_instance ADD COLUMN status VARCHAR")
        op.execute("ALTER TABLE deployed_workflow_instance ADD COLUMN deployment_metadata JSON")

        # Add unique index to models.model_name
        op.execute("CREATE UNIQUE INDEX uq_model_name ON models (model_name)")

        # Recreate 'workflows' table with nullable fields
        op.execute("ALTER TABLE workflows RENAME TO workflows_old")
        op.execute("""
            CREATE TABLE workflows (
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
        op.execute("""
            INSERT INTO workflows (
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory
            )
            SELECT
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory
            FROM workflows_old
        """)
        op.execute("DROP TABLE workflows_old")

        # Recreate 'deployed_workflow_instance' with new columns
        op.execute("ALTER TABLE deployed_workflow_instance RENAME TO deployed_workflow_instance_old")
        op.execute("""
            CREATE TABLE deployed_workflow_instance (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                type VARCHAR,
                status VARCHAR,
                workflow_id VARCHAR NOT NULL,
                cml_deployed_model_id VARCHAR,
                is_stale BOOLEAN,
                deployment_metadata JSON
            )
        """)
        op.execute("""
            INSERT INTO deployed_workflow_instance (
                id, name, workflow_id, cml_deployed_model_id, is_stale
            )
            SELECT id, name, workflow_id, cml_deployed_model_id, is_stale
            FROM deployed_workflow_instance_old
        """)
        op.execute("DROP TABLE deployed_workflow_instance_old")

    except Exception as e:
        print(f'Skipping revision "{revision}" upgrade: {str(e)}')


def downgrade() -> None:
    try:
        # Revert workflows changes
        op.execute("ALTER TABLE workflows RENAME TO workflows_old")
        op.execute("""
            CREATE TABLE workflows (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                description VARCHAR,
                crew_ai_process TEXT,
                crew_ai_agents JSON,
                crew_ai_tasks JSON,
                crew_ai_manager_agent VARCHAR,
                crew_ai_llm_provider_model_id VARCHAR,
                is_conversational BOOLEAN NOT NULL,
                is_draft BOOLEAN,
                directory VARCHAR NOT NULL
            )
        """)
        op.execute("""
            INSERT INTO workflows (
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory
            )
            SELECT
                id, name, description, crew_ai_process, crew_ai_agents, crew_ai_tasks,
                crew_ai_manager_agent, crew_ai_llm_provider_model_id,
                is_conversational, is_draft, directory
            FROM workflows_old
        """)
        op.execute("DROP TABLE workflows_old")

        # Revert deployed_workflow_instance changes
        op.execute("ALTER TABLE deployed_workflow_instance RENAME TO deployed_workflow_instance_old")
        op.execute("""
            CREATE TABLE deployed_workflow_instance (
                id VARCHAR PRIMARY KEY NOT NULL,
                name VARCHAR NOT NULL,
                workflow_id VARCHAR NOT NULL,
                cml_deployed_model_id VARCHAR,
                is_stale BOOLEAN
            )
        """)
        op.execute("""
            INSERT INTO deployed_workflow_instance (
                id, name, workflow_id, cml_deployed_model_id, is_stale
            )
            SELECT id, name, workflow_id, cml_deployed_model_id, is_stale
            FROM deployed_workflow_instance_old
        """)
        op.execute("DROP TABLE deployed_workflow_instance_old")

        # Drop index
        op.execute("DROP INDEX IF EXISTS uq_model_name")

    except Exception as e:
        print(f'Skipping revision "{revision}" downgrade: "{str(e)}"')
