from datetime import timedelta
import asyncio, os
from typing import List, Type, Union, Optional, Dict
from mcp import ClientSession, StdioServerParameters, types as mcp_types
from mcp.client.stdio import stdio_client
from studio.db.dao import get_dao
from studio.db import model as db_model
import studio.consts as consts


def _get_runtime_command(mcp_type: consts.SupportedMCPTypes) -> str:
    if mcp_type == consts.SupportedMCPTypes.PYTHON.value:
        return "uvx"
    elif mcp_type == consts.SupportedMCPTypes.NODE.value:
        return "npx"
    else:
        raise ValueError(f"Unsupported MCP type: {mcp_type}")


async def _get_mcp_tools(server_params: StdioServerParameters) -> List[mcp_types.Tool]:
    timeout = timedelta(seconds=120)  # 2 minutes
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


def _update_mcp_tools(
    mcp_id: str,
    db_class: Union[Type[db_model.MCPTemplate], Type[db_model.MCPInstance]],
    env_vars: Optional[Dict[str, str]] = None,
):
    print(f"Updating MCP tools for MCP {mcp_id}")

    with get_dao().get_session() as session:
        mcp_obj = session.query(db_class).filter(db_class.id == mcp_id).first()
        if not mcp_obj:
            raise ValueError(f"MCP template/instance with id {mcp_id} not found")
        print(f"MCP Name: {mcp_obj.name}")

        env_vars = env_vars or {}
        env_to_pass = os.environ.copy()
        env_to_pass.update({k: (env_vars[k] if k in env_vars else "dummy") for k in mcp_obj.env_names})
        command = _get_runtime_command(mcp_obj.type)
        mcp_server_params = StdioServerParameters(
            command=command,
            args=list(mcp_obj.args),
            env=env_to_pass,
        )

        try:
            tools = asyncio.run(_get_mcp_tools(mcp_server_params))
            mcp_obj.status = consts.MCPStatus.VALID.value
            mcp_obj.tools = [_t.model_dump() for _t in tools]
        except Exception as e:
            print(f"Error updating MCP tools for MCP {mcp_id}: {e}")
            mcp_obj.status = consts.MCPStatus.VALIDATION_FAILED.value
        session.commit()
