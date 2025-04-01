import os
import unittest
from typing import Union

from studio.cross_cutting.utils import (
    get_job_by_name
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

    def list_jobs(self, project_id, page_size):
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

