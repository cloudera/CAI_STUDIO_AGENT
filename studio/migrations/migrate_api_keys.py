import os
from cmlapi import CMLServiceApi
import json
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.models.utils import _sanitize_model_id, _sanitize_api_key

def migrate_api_keys_to_env(cml: CMLServiceApi, dao: AgentStudioDao) -> None:
    """Migrate API keys from database to project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")
            
        # Get current project environment
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}
            
        # Get all models with API keys
        with dao.get_session() as session:
            models = session.query(db_model.Model).all()
            
            for model in models:
                if model.api_key:  # If API key exists in database
                    # Add to environment variables
                    env_key = f"MODEL_API_KEY_{_sanitize_model_id(model.model_id)}"
                    environment[env_key] = _sanitize_api_key(model.api_key)
                    
                    # Clear API key from database
                    model.api_key = ""
                    
            # Commit database changes
            session.commit()
            
        # Update project environment with new API keys
        update_body = {"environment": json.dumps(environment)}
        cml.update_project(update_body, project_id)
        
        print("Successfully migrated API keys to project environment variables")
        
    except Exception as e:
        print(f"Error migrating API keys: {str(e)}")
        raise 