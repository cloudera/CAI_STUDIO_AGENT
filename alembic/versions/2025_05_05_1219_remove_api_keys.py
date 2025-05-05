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
            print("\nWarning: CDSW_PROJECT_ID not found, skipping API key migration")
            return
            
        print(f"\nUsing project ID: {project_id}")
        
        # Get current project environment
        print("Fetching project environment...")
        
        # Use default CML client
        import cmlapi
        cml = cmlapi.default_client()
        print("Successfully initialized CML API client")
            
        try:
            project = cml.get_project(project_id)
            print("Successfully retrieved project")
            
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
            print("\nError during CML API operations:")
            print(f"Error type: {type(e).__name__}")
            print(f"Error message: {str(e)}")
            if hasattr(e, 'body'):
                print(f"Response body: {e.body}")
            if hasattr(e, 'headers'):
                print(f"Response headers: {e.headers}")
            raise
            
    except Exception as e:
        print(f"\nWarning: Error during API key migration:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        if hasattr(e, '__traceback__'):
            import traceback
            print("Traceback:")
            traceback.print_tb(e.__traceback__)
        # Don't raise the error - we still want to drop the column even if migration fails


def upgrade() -> None:
    print("Starting API key migration process...")
    
    # First migrate existing API keys to environment variables
    migrate_api_keys_to_env()
    
    print("Attempting to remove api_key column from models table...")
    try:
        # Get existing columns from the models table
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        columns = inspector.get_columns('models')
        
        print(f"Found existing columns: {[col['name'] for col in columns]}")
        
        # Create column definitions for new table, excluding api_key
        column_defs = []
        for col in columns:
            if col['name'] != 'api_key':
                nullable_str = "" if col.get('nullable', True) else " NOT NULL"
                default_str = f" DEFAULT {col['default']}" if col.get('default') is not None else ""
                column_defs.append(f"{col['name']} {col['type']}{nullable_str}{default_str}")
        
        # Create new table without the api_key column
        print("Creating new table without api_key column...")
        column_defs_str = ',\n    '.join(column_defs)
        create_table_sql = f"""
            CREATE TABLE models_new (
                {column_defs_str}
            )
        """
        print(f"Create table SQL: {create_table_sql}")
        op.execute(create_table_sql)
        
        # Generate column list for INSERT
        column_names = [col['name'] for col in columns if col['name'] != 'api_key']
        columns_sql = ', '.join(column_names)
        
        # Copy data from old table to new table
        print("Copying data to new table...")
        insert_sql = f"""
            INSERT INTO models_new 
            SELECT {columns_sql}
            FROM models
        """
        print(f"Insert SQL: {insert_sql}")
        op.execute(insert_sql)
        
        # Verify data was copied by counting rows in both tables
        old_count = op.execute("SELECT COUNT(*) as count FROM models").fetchone()[0]
        new_count = op.execute("SELECT COUNT(*) as count FROM models_new").fetchone()[0]
        print(f"Original table had {old_count} rows, new table has {new_count} rows")
        
        if old_count != new_count:
            raise Exception(f"Data copy mismatch: original table had {old_count} rows but new table has {new_count} rows")
        
        print("Dropping old table...")
        op.execute("DROP TABLE models")
        
        print("Renaming new table...")
        op.execute("ALTER TABLE models_new RENAME TO models")
        
        print("Successfully completed table recreation process")
    except Exception as e:
        print(f"Critical error during table recreation: {str(e)}")
        print("Full error details:")
        import traceback
        traceback.print_exc()
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
            # Get existing columns from the models table
            bind = op.get_bind()
            inspector = sa.inspect(bind)
            columns = inspector.get_columns('models')
            
            print(f"Found existing columns: {[col['name'] for col in columns]}")
            
            # Create column definitions including api_key
            column_defs = []
            for col in columns:
                nullable_str = "" if col.get('nullable', True) else " NOT NULL"
                default_str = f" DEFAULT {col['default']}" if col.get('default') is not None else ""
                column_defs.append(f"{col['name']} {col['type']}{nullable_str}{default_str}")
            column_defs.append("api_key VARCHAR")
            
            # Create new table with api_key column
            print("Creating new table with api_key column...")
            column_defs_str = ',\n    '.join(column_defs)
            create_table_sql = f"""
                CREATE TABLE models_new (
                    {column_defs_str}
                )
            """
            print(f"Create table SQL: {create_table_sql}")
            op.execute(create_table_sql)
            
            # Generate column list for INSERT
            column_names = [col['name'] for col in columns]
            columns_sql = ', '.join(column_names)
            
            # Copy existing data
            print("Copying existing data to new table...")
            insert_sql = f"""
                INSERT INTO models_new ({columns_sql})
                SELECT {columns_sql}
                FROM models
            """
            print(f"Insert SQL: {insert_sql}")
            op.execute(insert_sql)
            
            # Verify data was copied by counting rows in both tables
            old_count = op.execute("SELECT COUNT(*) as count FROM models").fetchone()[0]
            new_count = op.execute("SELECT COUNT(*) as count FROM models_new").fetchone()[0]
            print(f"Original table had {old_count} rows, new table has {new_count} rows")
            
            if old_count != new_count:
                raise Exception(f"Data copy mismatch: original table had {old_count} rows but new table has {new_count} rows")
            
            print("Dropping old table...")
            op.execute("DROP TABLE models")
            
            print("Renaming new table...")
            op.execute("ALTER TABLE models_new RENAME TO models")
            
            print("Successfully completed table recreation process")
        except Exception as e:
            print(f"Critical error during table recreation: {str(e)}")
            print("Full error details:")
            import traceback
            traceback.print_exc()
            raise
    
    print("Warning: API keys cannot be restored from environment variables")
    print("Downgrade completed successfully")
