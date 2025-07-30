# No top level studio.db imports allowed to support wokrflow model deployment

import asyncio, os
from typing import Dict
from datetime import timedelta

from mcp import StdioServerParameters, ClientSession, types as mcp_types
from mcp.client.stdio import stdio_client
from crewai_tools import MCPServerAdapter


import engine.types as input_types
from engine.types import *

_mcp_type_to_command = {
    "PYTHON": "uvx",
    "NODE": "npx",
}


def get_mcp_tools_for_crewai(mcp_instance: Input__MCPInstance, env_vars: Dict[str, str]) -> input_types.MCPObjects:
    env_to_pass = os.environ.copy()
    env_to_pass.update(env_vars)
    server_params = StdioServerParameters(
        command=_mcp_type_to_command[mcp_instance.type],
        args=mcp_instance.args,
        env=env_to_pass,
    )
    adapter = MCPServerAdapter(server_params)
    tool_list = adapter.tools
    if mcp_instance.tools:  # Filter tools if specified
        tool_list = [_t for _t in tool_list if _t.name in mcp_instance.tools]
    return input_types.MCPObjects(
        local_session=adapter,
        tools=tool_list,
    )


async def get_mcp_tool_definitions(mcp_instance: Input__MCPInstance, env_vars: Dict[str, str]) -> List[mcp_types.Tool]:
    timeout = timedelta(seconds=60)  # 60 seconds
    env_to_pass = os.environ.copy()
    env_to_pass.update(env_vars)
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
    mcp_instances: List[Input__MCPInstance], env_vars: Dict[str, Dict[str, str]]
) -> Dict[str, List[mcp_types.Tool]]:
    tasks = [
        get_mcp_tool_definitions(mcp_instance, env_vars.get(mcp_instance.id, {})) for mcp_instance in mcp_instances
    ]
    results = await asyncio.gather(*tasks)
    return {mcp_instance.id: result for (mcp_instance, result) in zip(mcp_instances, results)}
