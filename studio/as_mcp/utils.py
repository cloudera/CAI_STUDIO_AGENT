from datetime import timedelta
import asyncio, os, shutil
from uuid import uuid4
from typing import List, Type, Union, Optional, Dict
from mcp import ClientSession, StdioServerParameters, types as mcp_types
from mcp.client.stdio import stdio_client
from studio.db.dao import get_dao
from studio.db import model as db_model, DbSession
import studio.consts as consts
from studio.cross_cutting.global_thread_pool import get_thread_pool


def _get_runtime_command(mcp_type: consts.SupportedMCPTypes) -> str:
    if mcp_type == consts.SupportedMCPTypes.PYTHON.value:
        return "uvx"
    elif mcp_type == consts.SupportedMCPTypes.NODE.value:
        return "npx"
    else:
        raise ValueError(f"Unsupported MCP type: {mcp_type}")


async def _get_mcp_tools(server_params: StdioServerParameters) -> List[mcp_types.Tool]:
    timeout = timedelta(seconds=60)  # 60 seconds
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


def clone_mcp_instance(mcp_instance_id: str, target_workflow_id: str, db_session: DbSession) -> str:
    workflow_obj = db_session.query(db_model.Workflow).filter_by(id=target_workflow_id).first()
    if not workflow_obj:
        raise ValueError(f"Workflow with id {target_workflow_id} not found")

    original_mcp_instance = db_session.query(db_model.MCPInstance).filter_by(id=mcp_instance_id).first()
    if not original_mcp_instance:
        raise ValueError(f"MCP Instance with id {mcp_instance_id} not found")

    new_mcp_instance_id = str(uuid4())
    new_mcp_instance_name = original_mcp_instance.name

    new_mcp_image_path = ""
    if original_mcp_instance.mcp_image_path:
        _, ext = os.path.splitext(original_mcp_instance.mcp_image_path)
        os.makedirs(consts.MCP_INSTANCE_ICONS_LOCATION, exist_ok=True)
        new_mcp_image_path = os.path.join(consts.MCP_INSTANCE_ICONS_LOCATION, f"{new_mcp_instance_id}_icon{ext}")
        shutil.copy(original_mcp_instance.mcp_image_path, new_mcp_image_path)

    new_mcp_instance = db_model.MCPInstance(
        id=new_mcp_instance_id,
        workflow_id=target_workflow_id,
        name=new_mcp_instance_name,
        type=original_mcp_instance.type,
        args=list(original_mcp_instance.args),
        env_names=list(original_mcp_instance.env_names),
        activated_tools=list(original_mcp_instance.activated_tools),
        status=consts.MCPStatus.VALIDATING.value,
        mcp_image_path=new_mcp_image_path,
    )

    db_session.add(new_mcp_instance)
    db_session.commit()

    get_thread_pool().submit(
        _update_mcp_tools,
        new_mcp_instance_id,
        db_model.MCPInstance,
    )

    return new_mcp_instance_id
