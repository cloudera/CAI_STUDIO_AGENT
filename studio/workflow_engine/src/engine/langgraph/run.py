import importlib.util


def import_graph_callable(path: str):
    """
    Import a callable from a Python file path like "./src/foo/bar.py:graph".
    """
    file_path, attr = path.split(":")
    spec = importlib.util.spec_from_file_location("dynamic_graph", file_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, attr)


async def run_workflow_langgraph_instance(graph_object, input_data):
    return await graph_object.astream(input_data)
