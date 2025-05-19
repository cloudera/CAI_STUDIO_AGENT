import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

from unittest.mock import patch
from pydantic import BaseModel

from crewai.utilities.events import CrewKickoffStartedEvent

from engine.crewai.events import process_event, post_event, register_global_handlers


def test_process_event_type_missing():
    class RandomEvent(BaseModel):
        some_field: str

    random_event = RandomEvent(some_field="123")
    processed_event = process_event(random_event)
    assert processed_event == {}


def test_process_event_type_happy_path():
    event = CrewKickoffStartedEvent(crew_name="test crew", inputs={"test": "inputs"})
    processed_event = process_event(event)
    assert processed_event == {"inputs": {"test": "inputs"}}


@patch("engine.crewai.events.get_trace_id")
@patch("engine.crewai.events.process_event")
@patch("engine.crewai.events.get_ops_endpoint")
@patch("engine.crewai.events.requests.post")
@patch("engine.crewai.events.os.getenv")
def test_post_event_happy_path(m_getenv, m_post, m_get_ops_endpoint, m_process_event, m_get_trace_id):
    m_get_trace_id.return_value = "trace_id"
    m_get_ops_endpoint.return_value = "ops_endpoint"
    m_getenv.return_value = "api_key"
    m_process_event.return_value = {"extra": "field"}

    class CustomSource(BaseModel):
        agent_studio_id: str

    class CustomEvent(BaseModel):
        timestamp: str
        type: str

    post_event(
        source=CustomSource(agent_studio_id="agent_studio_id"),
        event=CustomEvent(timestamp="timestamp", type="custom_event_type"),
    )

    m_post.assert_called_with(
        url="ops_endpoint/events",
        headers={"Authorization": "Bearer api_key"},
        json={
            "trace_id": "trace_id",
            "event": {
                "agent_studio_id": "agent_studio_id",
                "timestamp": "timestamp",
                "type": "custom_event_type",
                "extra": "field",
            },
        },
    )


@patch("engine.crewai.events.crewai_event_bus.on")
def test_register_global_handlers_already_registered(m_on):
    import engine.crewai.events as events

    events._handlers_registered = True

    register_global_handlers()

    m_on.assert_not_called()


@patch("engine.crewai.events.crewai_event_bus.on")
def test_register_global_handlers_happy_path(m_on):
    import engine.crewai.events as events

    events._handlers_registered = False

    register_global_handlers()

    assert m_on.call_count == len(list(events.EVENT_PROCESSORS.keys()))
    assert events._handlers_registered == True
