# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict

from mcp import StdioServerParameters
from crewai_tools import MCPServerAdapter


import engine.types as input_types
from engine.types import *
from engine.crewai.wrappers import AgentStudioCrewAIMcpTool

_mcp_type_to_command = {
    "PYTHON": "uvx",
    "NODE": "npx",
}


def get_mcp_tools(
    mcp_instance: Input__MCPInstance, env_vars: Dict[str, str], workflow_directory: str
) -> input_types.MCPObjects:
    server_params = StdioServerParameters(
        command=_mcp_type_to_command[mcp_instance.type],
        args=mcp_instance.args,
        env=env_vars,
    )
    adapter = MCPServerAdapter(server_params)

    tool_list = [
        AgentStudioCrewAIMcpTool(agent_studio_id=mcp_instance.id, crewai_tool=_t)
        for _t in adapter.tools
        if _t.name in mcp_instance.tools
    ]

    return input_types.MCPObjects(
        local_session=adapter,
        tools=tool_list,
    )
