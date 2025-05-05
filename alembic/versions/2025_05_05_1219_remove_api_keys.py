"""remove API keys

Revision ID: 717c78801bd0
Revises: 3fa293c89b1b
Create Date: 2025-05-05 12:19:49.243569

"""
from typing import Sequence, Union
import os
import json
import base64
from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session

try:
    from cmlapi import CMLServiceApi
except ImportError:
    CMLServiceApi = None


# revision identifiers, used by Alembic.
revision: str = '717c78801bd0'
down_revision: Union[str, None] = '3fa293c89b1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _encode_value(value: str) -> str:
    """Encode value for storage in environment variables using base64"""
    if not value or not isinstance(value, str):
        return ""
    return base64.b64encode(value.encode()).decode()


def _get_env_key(model_id: str) -> str:
    """Generate environment variable key for model API key"""
    encoded_id = _encode_value(model_id)
    return f"MODEL_API_KEY_{encoded_id}"


def migrate_api_keys_to_env() -> None:
    """Migrate API keys from database to project environment variables"""
    try:
        if CMLServiceApi is None:
            print("Warning: cmlapi not installed, skipping API key migration")
            return
            
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            print("Warning: CDSW_PROJECT_ID not found, skipping API key migration")
            return
            
        # Get current project environment
        cml = CMLServiceApi()
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}
            
        # Get all models with API keys
        bind = op.get_bind()
        session = Session(bind=bind)
        
        # Query all models that have API keys
        models = session.execute(
            sa.text("SELECT model_id, api_key FROM models WHERE api_key IS NOT NULL AND api_key != ''")
        ).fetchall()
            
        for model in models:
            # Add to environment variables using base64 encoding
            env_key = _get_env_key(model.model_id)
            environment[env_key] = _encode_value(model.api_key)
                
        # Update project environment with new API keys
        update_body = {"environment": json.dumps(environment)}
        cml.update_project(update_body, project_id)
        
        print("Successfully migrated API keys to project environment variables")
        
    except Exception as e:
        print(f"Warning: Error migrating API keys: {str(e)}")
        # Don't raise the error - we still want to drop the column even if migration fails


def upgrade() -> None:
    # First migrate existing API keys to environment variables
    migrate_api_keys_to_env()
    
    # Then drop the column
    op.drop_column('models', 'api_key')


def downgrade() -> None:
    # Add the column back, but we can't restore the API keys
    op.add_column('models', sa.Column('api_key', sa.VARCHAR(), nullable=True))
    print("Warning: API keys cannot be restored from environment variables")
