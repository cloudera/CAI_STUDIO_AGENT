import logging
from concurrent.futures import ThreadPoolExecutor
from cmlapi import CMLServiceApi
from studio.db.dao import AgentStudioDao
from studio.cross_cutting.shared_operations import get_deployed_workflows, redeploy_single_workflow

def redeploy_all_workflows(cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None):
    """Redeploy all deployed workflows"""
    if logger is None:
        logger = logging.getLogger(__name__)
        
    try:
        # Get list of deployed workflows
        deployed_workflows = get_deployed_workflows(cml, dao, logger)
        
        # Create thread pool for async redeployments
        with ThreadPoolExecutor(max_workers=5) as executor:
            for workflow in deployed_workflows:
                # Submit each redeployment to thread pool
                executor.submit(
                    redeploy_single_workflow,
                    workflow.deployed_workflow_id,
                    cml,
                    dao,
                    logger
                )
        
        logger.info("All workflow redeployments initiated")
        
    except Exception as e:
        logger.error(f"Error redeploying workflows: {str(e)}") 