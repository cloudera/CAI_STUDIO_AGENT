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
    print("\nStarting API key migration to environment variables...")
    try:
        if CMLServiceApi is None:
            print("Warning: cmlapi not installed, skipping API key migration")
            return
            
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            print("Warning: CDSW_PROJECT_ID not found, skipping API key migration")
            return
            
        print(f"Using project ID: {project_id}")
        
        # Get current project environment
        print("Fetching project environment...")
        cml = CMLServiceApi()
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
            print("Successfully loaded existing project environment")
        except (json.JSONDecodeError, TypeError) as e:
            print(f"Warning: Error parsing project environment: {str(e)}")
            print("Starting with empty environment")
            environment = {}
            
        # Get all models with API keys
        print("Connecting to database...")
        bind = op.get_bind()
        session = Session(bind=bind)
        
        # Query all models that have API keys
        print("Querying models with API keys...")
        models = session.execute(
            sa.text("SELECT model_id, api_key FROM models WHERE api_key IS NOT NULL AND api_key != ''")
        ).fetchall()
        
        model_count = len(models)
        print(f"Found {model_count} models with API keys")
            
        if model_count > 0:
            print("Starting API key migration...")
            for i, model in enumerate(models, 1):
                # Add to environment variables using base64 encoding
                env_key = _get_env_key(model.model_id)
                environment[env_key] = _encode_value(model.api_key)
                print(f"Migrated API key {i}/{model_count} for model: {model.model_id}")
                    
            # Update project environment with new API keys
            print("Updating project environment...")
            update_body = {"environment": json.dumps(environment)}
            cml.update_project(update_body, project_id)
            
            print(f"Successfully migrated {model_count} API keys to project environment variables")
        else:
            print("No API keys found to migrate")
        
    except Exception as e:
        print(f"\nWarning: Error during API key migration:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print("Traceback:")
            traceback.print_tb(e.__traceback__)
        print("\nContinuing with column removal despite migration error")
        # Don't raise the error - we still want to drop the column even if migration fails


def upgrade() -> None:
    print("Starting API key migration process...")
    
    # First migrate existing API keys to environment variables
    migrate_api_keys_to_env()
    
    print("Attempting to remove api_key column from models table...")
    try:
        # Try dropping the column directly first
        op.drop_column('models', 'api_key')
        print("Successfully dropped api_key column using direct method")
    except Exception as e:
        print(f"Error dropping api_key column directly: {str(e)}")
        print("Falling back to table recreation approach...")
        
        try:
            # Fallback to table recreation approach for SQLite
            print("Creating new table without api_key column...")
            op.execute("""
                CREATE TABLE models_new (
                    model_id VARCHAR NOT NULL, 
                    name VARCHAR,
                    description VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    created_by VARCHAR,
                    updated_by VARCHAR,
                    PRIMARY KEY (model_id)
                )
            """)
            
            print("Copying data to new table...")
            result = op.execute("""
                INSERT INTO models_new 
                SELECT model_id, name, description, created_at, updated_at, created_by, updated_by
                FROM models
            """)
            print(f"Copied {result.rowcount} rows to new table")
            
            print("Dropping old table...")
            op.execute("DROP TABLE models")
            
            print("Renaming new table...")
            op.execute("ALTER TABLE models_new RENAME TO models")
            
            print("Successfully completed table recreation process")
        except Exception as e:
            print(f"Critical error during table recreation: {str(e)}")
            raise


def downgrade() -> None:
    print("Starting downgrade process to restore api_key column...")
    
    try:
        # Try adding the column directly first
        print("Attempting to add api_key column directly...")
        op.add_column('models', sa.Column('api_key', sa.VARCHAR(), nullable=True))
        print("Successfully added api_key column using direct method")
    except Exception as e:
        print(f"Error adding api_key column directly: {str(e)}")
        print("Falling back to table recreation approach...")
        
        try:
            # Fallback to table recreation approach for SQLite
            print("Creating new table with api_key column...")
            op.execute("""
                CREATE TABLE models_new (
                    model_id VARCHAR NOT NULL,
                    name VARCHAR,
                    description VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    created_by VARCHAR,
                    updated_by VARCHAR,
                    api_key VARCHAR,
                    PRIMARY KEY (model_id)
                )
            """)
            
            print("Copying existing data to new table...")
            result = op.execute("""
                INSERT INTO models_new (model_id, name, description, created_at, updated_at, created_by, updated_by)
                SELECT model_id, name, description, created_at, updated_at, created_by, updated_by
                FROM models
            """)
            print(f"Copied {result.rowcount} rows to new table")
            
            print("Dropping old table...")
            op.execute("DROP TABLE models")
            
            print("Renaming new table...")
            op.execute("ALTER TABLE models_new RENAME TO models")
            
            print("Successfully completed table recreation process")
        except Exception as e:
            print(f"Critical error during table recreation: {str(e)}")
            raise
    
    print("Warning: API keys cannot be restored from environment variables")
    print("Downgrade completed successfully")
