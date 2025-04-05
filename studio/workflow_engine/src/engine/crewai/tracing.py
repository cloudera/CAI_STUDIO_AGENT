import openinference.instrumentation.crewai as crewaiinst
from openinference.instrumentation.litellm import LiteLLMInstrumentor
import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

from engine.ops import get_phoenix_ops_tracer_provider


def instrument_crewai_workflow(workflow_name: str):
    """
    Instrument agents, crews and tasks within a given model to report
    to the observability platform.
    """
    tracer_provider = get_phoenix_ops_tracer_provider(workflow_name)
    crewaiinst.CrewAIInstrumentor().instrument(tracer_provider=tracer_provider)
    LiteLLMInstrumentor().instrument(tracer_provider=tracer_provider)
    return tracer_provider


def reset_crewai_instrumentation():
    # Add logic to un-instrument or reset the instrumentors
    crewaiinst.CrewAIInstrumentor().uninstrument()  # Check if this method exists
    LiteLLMInstrumentor().uninstrument()  # Check if this method exists
