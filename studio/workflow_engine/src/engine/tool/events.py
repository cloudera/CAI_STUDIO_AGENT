from pydantic import BaseModel
from datetime import datetime
from typing import Dict, Any


# Tool test event classes
class ToolTestStartedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolTestStarted"
    tool_instance_id: str
    params: Dict[str, Any]


class ToolTestCompletedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolTestCompleted"
    tool_instance_id: str
    output: Any


class ToolTestFailedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolTestFailed"
    tool_instance_id: str
    error: str


# New event for venv creation start
class ToolVenvCreationStartedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolVenvCreationStarted"
    tool_instance_id: str
    tool_dir: str
    requirements_file: str = "requirements.txt"


# New event for venv creation finished
class ToolVenvCreationFinishedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolVenvCreationFinished"
    tool_instance_id: str
    tool_dir: str
    requirements_file: str = "requirements.txt"
    pip_output: str = ""
    pip_error: str = ""


# New event for venv creation failed
class ToolVenvCreationFailedEvent(BaseModel):
    timestamp: datetime
    type: str = "ToolVenvCreationFailed"
    tool_instance_id: str
    tool_dir: str
    requirements_file: str = "requirements.txt"
    error: str
    pip_output: str = ""
    pip_error: str = ""


# Event processor for tool test events
TOOL_EVENT_PROCESSORS = {
    ToolTestStartedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "params": x.params,
    },
    ToolTestCompletedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "output": x.output,
    },
    ToolTestFailedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "error": x.error,
    },
    ToolVenvCreationStartedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "tool_dir": x.tool_dir,
        "requirements_file": x.requirements_file,
    },
    ToolVenvCreationFinishedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "tool_dir": x.tool_dir,
        "requirements_file": x.requirements_file,
        "pip_output": x.pip_output,
        "pip_error": x.pip_error,
    },
    ToolVenvCreationFailedEvent: lambda x: {
        "tool_instance_id": x.tool_instance_id,
        "tool_dir": x.tool_dir,
        "requirements_file": x.requirements_file,
        "error": x.error,
        "pip_output": x.pip_output,
        "pip_error": x.pip_error,
    },
}


def process_tool_event(event):
    processed_event = {}
    if event.__class__ in list(TOOL_EVENT_PROCESSORS.keys()):
        processed_event.update(TOOL_EVENT_PROCESSORS[event.__class__](event))
    return processed_event
