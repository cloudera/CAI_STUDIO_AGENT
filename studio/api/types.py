from enum import Enum


class WorkflowState(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class ToolInstanceStatus(Enum):
    CREATED = "CREATED"
    PREPARING = "PREPARING"
    READY = "READY"
    FAILED = "FAILED"
