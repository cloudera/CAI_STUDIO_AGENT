# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict, Optional, Type
from pydantic import BaseModel
import os
from crewai.tools import BaseTool
import ast
from typing import Optional
import subprocess
import json
from textwrap import dedent, indent
import threading
import hashlib
import re
import shutil
import venv

from mcp import StdioServerParameters
from crewai_tools import MCPServerAdapter


import engine.types as input_types
from engine.types import *

_mcp_type_to_command = {
    "PYTHON": "uvx",
    "NODE": "npx",
}

def get_mcp_tools(mcp_instance: Input__MCPInstance, env_vars: Dict[str, str]) -> input_types.MCPObjects:
    server_params = StdioServerParameters(
        command=_mcp_type_to_command[mcp_instance.type],
        args=mcp_instance.args,
        env=env_vars,
    )
    adapter = MCPServerAdapter(server_params)
    tool_list = adapter.tools
    if mcp_instance.tools: # Filter tools if specified
        tool_list = [_t for _t in tool_list if _t.name in mcp_instance.tools]
    return input_types.MCPObjects(
        local_session=adapter,
        tools=tool_list,
    )
    
