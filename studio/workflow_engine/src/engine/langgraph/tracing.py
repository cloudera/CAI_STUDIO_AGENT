from openinference.instrumentation.langchain import LangChainInstrumentor

from engine.ops import get_phoenix_ops_tracer_provider

# https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-langchain


def instrument_langgraph_artifact(workflow_name: str, graph: object) -> object:
    """
    Registers Phoenix tracing for a LangGraph graph object and returns the traced graph.

    Args:
        workflow_name (str): Name to register the Phoenix project under.
        graph (object): The raw LangGraph graph object to be traced.

    Returns:
        object: The traced LangGraph graph.
    """
    tracer_provider = get_phoenix_ops_tracer_provider(workflow_name)
    LangChainInstrumentor().instrument()
    return tracer_provider


def reset_langgraph_instrumentataion():
    LangChainInstrumentor().uninstrument()
