import os
from datetime import timedelta
import asyncio
from typing import List, Type, Union, Optional, Dict
from mcp import ClientSession, StdioServerParameters, types as mcp_types
from mcp.client.stdio import stdio_client
from studio.db.dao import get_dao
from studio.db import model as db_model
import studio.consts as consts
import studio.cross_cutting.utils as cc_utils


async def _get_mcp_tools(server_params: StdioServerParameters) -> List[mcp_types.Tool]:
    timeout = timedelta(seconds=30)
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
    # Supporting python based MCPs for now

    uvx_bin_path = os.path.join(os.path.abspath(cc_utils.get_studio_subdirectory()), ".venv", "bin", "uvx")
    print(f"Updating MCP tools for MCP {mcp_id}")

    with get_dao().get_session() as session:
        mcp_obj = session.query(db_class).filter(db_class.id == mcp_id).first()
        if not mcp_obj:
            raise ValueError(f"MCP template/instance with id {mcp_id} not found")
        print(f"MCP Name: {mcp_obj.name}")

        env_vars = env_vars or {}
        env_to_pass = {k: (env_vars[k] if k in env_vars else "dummy") for k in mcp_obj.env_names}
        mcp_server_params = StdioServerParameters(
            command=uvx_bin_path,
            args=list(mcp_obj.args),
            env=env_to_pass,
        )

        try:
            tools = asyncio.run(_get_mcp_tools(mcp_server_params))
            mcp_obj.status = consts.MCPStatus.VALID.value
            mcp_obj.tools = [_t.model_dump() for _t in tools]
        except Exception as e:
            mcp_obj.status = consts.MCPStatus.VALIDATION_FAILED.value
        session.commit()
