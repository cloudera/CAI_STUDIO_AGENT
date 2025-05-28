import os
import unittest
import pytest
from pydantic import BaseModel
from unittest.mock import patch, MagicMock
from typing import Union
from cmlapi import CMLServiceApi
import cmlapi

from studio.cross_cutting.utils import (
    get_job_by_name,
    deploy_cml_model
)


# --- Begin Dummy Classes and get_job_by_name Implementation ---

# Dummy job class simulating cmlapi.Job
class DummyJob:
    def __init__(self, name: str):
        self.name = name

# Dummy response object that the list_jobs method returns.
class DummyListJobsResponse:
    def __init__(self, jobs):
        self.jobs = jobs

# Dummy CMLServiceApi simulating cmlapi.CMLServiceApi
class DummyCMLServiceApi:
    def __init__(self, jobs):
        self.jobs = jobs

    def list_jobs(self, project_id, search_filter: str = None, page_size: int = None):
        # The project_id and page_size parameters are ignored for testing purposes.
        return DummyListJobsResponse(self.jobs)
    

class TestGetJobByName(unittest.TestCase):
    def test_get_job_by_name(self):
        # Define several test cases to cover all the functionality.
        test_cases = [
            {
                "description": "No matching job",
                "jobs": [DummyJob("Other Job")],
                "search_name": "Job",
                "expected": None,
            },
            {
                "description": "Single exact match without version",
                "jobs": [DummyJob("Job")],
                "search_name": "Job",
                "expected": "Job",
            },
            {
                "description": "Single version match",
                "jobs": [DummyJob("Job v1.2")],
                "search_name": "Job",
                "expected": "Job v1.2",
            },
            {
                "description": "Multiple jobs with and without version",
                "jobs": [DummyJob("Job"), DummyJob("Job v1.2"), DummyJob("Job v2.1")],
                "search_name": "Job",
                "expected": "Job v2.1",
            },
            {
                "description": "Job with an invalid version format is treated as (0,0)",
                "jobs": [DummyJob("Job v1.2"), DummyJob("Job vX.Y"), DummyJob("Job v2.1")],
                "search_name": "Job",
                "expected": "Job v2.1",
            },
            {
                "description": "Version comparison with two-digit minor versions",
                "jobs": [DummyJob("Job v1.2"), DummyJob("Job v1.10")],
                "search_name": "Job",
                "expected": "Job v1.10",
            },
        ]

        for case in test_cases:
            with self.subTest(msg=case["description"]):
                # Create a dummy CML API with the provided job list.
                dummy_api = DummyCMLServiceApi(case["jobs"])
                result = get_job_by_name(dummy_api, case["search_name"])

                if case["expected"] is None:
                    self.assertIsNone(result, msg="Expected None when no job matches")
                else:
                    self.assertIsNotNone(result, msg="Expected a job but got None")
                    self.assertEqual(result.name, case["expected"],
                                     msg=f"Expected job name '{case['expected']}' but got '{result.name}'")

class IDResponse(BaseModel):
    id: str


@patch("studio.cross_cutting.utils.get_cml_project_number_and_id")
def test_deploy_cml_model_happy_path(mock_proj_number):
    mock_proj_number.return_value = "number", "proj_id"
    cml = MagicMock(spec=CMLServiceApi)
    cml.create_model.return_value = IDResponse(id="model_id")
    
    # Create model build request without model_root_dir
    out = deploy_cml_model(
        cml, "model_id", "test_comment",
        "test_file.py", "test_func", "test_runtime", None, "root/dir"
    )
    
    # Create expected request using cmlapi.CreateModelBuildRequest
    expected_body = cmlapi.CreateModelBuildRequest(
        project_id="proj_id",
        model_id="model_id",
        comment="test_comment",
        file_path="test_file.py",
        function_name="test_func",
        runtime_identifier="test_runtime",
        auto_deployment_config=None,
        auto_deploy_model=True,
        model_root_dir="root/dir",
    )
    
    cml.create_model_build.assert_called_with(expected_body, project_id="proj_id", model_id="model_id")


@patch("studio.cross_cutting.utils.get_cml_project_number_and_id")
def test_deploy_cml_model_no_root_dir(mock_proj_number):
    mock_proj_number.return_value = "number", "proj_id"
    cml = MagicMock(spec=CMLServiceApi)
    cml.create_model.return_value = IDResponse(id="model_id")
    out = deploy_cml_model(
        cml, "model_id", "test_comment",
        "test_file.py", "test_func", "test_runtime", None, None
    )
    cml.create_model_build.assert_called_with(
        cmlapi.CreateModelBuildRequest(
            project_id="proj_id",
            model_id="model_id",
            comment="test_comment",
            file_path="test_file.py",
            function_name="test_func",
            runtime_identifier="test_runtime",
            auto_deployment_config=None,
            auto_deploy_model=True,
        ),  project_id='proj_id', model_id='model_id'
    )



