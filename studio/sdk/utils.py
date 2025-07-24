import requests
import os
from studio.api import *
import studio.cross_cutting.utils as cc_utils


def get_deployed_workflow_endpoint(deployed_workflow: DeployedWorkflow):
    """
    Get the endpoint of the Workbench model that represents this deployed workflow.

    Args:
        deployed_workflow (DeployedWorkflow): the deployed workflow object.

    Returns:
        str: the Workbench model endpoint that can be used to send requests.
    """

    # Read these values from your environment or define them directly:
    CDSW_DOMAIN = os.environ.get("CDSW_DOMAIN")
    CDSW_APIV2_KEY = os.environ.get("CDSW_APIV2_KEY")

    try:
        # 1. Send GET request to /api/v2/models with page_size=10000
        # TODO: we should really be using a search_filter here, but there is
        # no search filter available on the cml model id, and the cml model name
        # is not being stored in our db. So this is very much not performant
        # but is sufficient for now to unblock workflow app development.
        scheme = cc_utils.get_url_scheme()
        url = f"{scheme}://{CDSW_DOMAIN}/api/v2/models"
        params = {"page_size": 10000}
        headers = {"authorization": f"Bearer {CDSW_APIV2_KEY}"}

        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()  # Raises an exception if 4xx/5xx

        # 2. Parse JSON and find the model
        data = response.json()  # e.g., { "models": [ ... ] }
        models_list = data.get("models", [])
        model = next((m for m in models_list if m["id"] == deployed_workflow.cml_deployed_model_id), None)

        if not model:
            print("Model is not found.")
            return None

        # 3. Build the output URL
        output_url = f"{scheme}://modelservice.{CDSW_DOMAIN}/model?accessKey={model['access_key']}"
        return output_url

    except Exception as error:
        print("Error fetching model URL:", error)
        return None
