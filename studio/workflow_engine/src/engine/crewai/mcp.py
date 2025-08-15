# No top level studio.db imports allowed to support wokrflow model deployment

import asyncio, os
from typing import Dict
from datetime import timedelta

from mcp import StdioServerParameters, ClientSession, types as mcp_types
from mcp.client.stdio import stdio_client
from mcpadapt.core import MCPAdapt
from mcpadapt.crewai_adapter import CrewAIAdapter


import engine.types as input_types
from engine.types import *
from engine.crewai.wrappers import AgentStudioCrewAITool

_mcp_type_to_command = {
    "PYTHON": "uvx",
    "NODE": "npx",
}


def _wrap_mcp_tool_with_agent_studio_wrapper(base_tool, mcp_instance_id: str) -> AgentStudioCrewAITool:
    """
    Wrap a BaseTool from MCP with AgentStudioCrewAITool to add agent_studio_mcp_id tracking.
    """

    class MCPWrappedTool(AgentStudioCrewAITool):
        # Define required Pydantic fields as class attributes
        name: str = ""
        description: str = ""

        def __init__(self, base_tool, mcp_instance_id: str):
            # Pass required fields to parent constructor
            super().__init__(
                name=base_tool.name,
                description=base_tool.description,
                agent_studio_id=mcp_instance_id,
            )
            self.args_schema = getattr(base_tool, "args_schema", None)
            self._base_tool = base_tool

        def _run(self, *args, **kwargs):
            return self._base_tool._run(*args, **kwargs)

        def _arun(self, *args, **kwargs):
            if hasattr(self._base_tool, "_arun"):
                return self._base_tool._arun(*args, **kwargs)
            return super()._arun(*args, **kwargs)

    return MCPWrappedTool(base_tool, mcp_instance_id)


def get_mcp_tools_for_crewai(
    mcp_instance: Input__MCPInstance, env_vars: Dict[str, str], session_directory: str = None
) -> input_types.MCPObjects:
    env_to_pass = os.environ.copy()
    env_to_pass.update(env_vars)
    if session_directory:
        env_to_pass["SESSION_DIRECTORY"] = session_directory
    server_params = StdioServerParameters(
        command=_mcp_type_to_command[mcp_instance.type],
        args=mcp_instance.args,
        env=env_to_pass,
    )
    adapter = MCPAdapt(server_params, CrewAIAdapter(), connect_timeout=60)
    adapter.__enter__()
    base_tools: list[BaseTool] = adapter.tools()

    # Wrap each tool with AgentStudioCrewAITool to add MCP tracking
    wrapped_tools = [_wrap_mcp_tool_with_agent_studio_wrapper(tool, mcp_instance.id) for tool in base_tools]

    return input_types.MCPObjects(
        local_session=adapter,
        tools=wrapped_tools,
    )


async def get_mcp_tool_definitions(
    mcp_instance: Input__MCPInstance, env_vars: Dict[str, str], session_directory: str = None
) -> List[mcp_types.Tool]:
    timeout = timedelta(seconds=60)  # 60 seconds
    env_to_pass = os.environ.copy()
    env_to_pass.update(env_vars)
    if session_directory:
        env_to_pass["SESSION_DIRECTORY"] = session_directory
    server_params = StdioServerParameters(
        command=_mcp_type_to_command[mcp_instance.type],
        args=mcp_instance.args,
        env=env_to_pass,
    )
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(
                read_stream=read,
                write_stream=write,
                read_timeout_seconds=timeout,
            ) as session:
                # Initialize the connection
                await session.initialize()
                print(f"Initialized session")
                tools = await session.list_tools()
                return tools.tools
    except Exception as e:
        print(f"Error getting MCP tool definitions for {mcp_instance.id}: {e}")
        return []


async def get_mcp_tools_definitions(
    mcp_instances: List[Input__MCPInstance], env_vars: Dict[str, Dict[str, str]], session_directory: str = None
) -> Dict[str, List[mcp_types.Tool]]:
    tasks = [
        get_mcp_tool_definitions(mcp_instance, env_vars.get(mcp_instance.id, {}), session_directory)
        for mcp_instance in mcp_instances
    ]
    results = await asyncio.gather(*tasks)
    return {mcp_instance.id: result for (mcp_instance, result) in zip(mcp_instances, results)}
