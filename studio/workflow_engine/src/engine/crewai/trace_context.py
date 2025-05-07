from contextvars import ContextVar

# Task-specific trace ID context variable. This variable is set per individual
# async task (every workflow execution), and is used as a differentiator
# for writing events to the Kombu message broker in the Ops & Metrics server.
_trace_id_ctx: ContextVar[str] = ContextVar("trace_id_ctx", default="unknown-trace")


def set_trace_id(trace_id: str):
    """
    Set the trace ID on a specific async task
    """
    _trace_id_ctx.set(trace_id)


def get_trace_id() -> str:
    """
    Get the trace ID on a specific task
    """
    return _trace_id_ctx.get()
