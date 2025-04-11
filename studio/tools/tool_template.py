import os
import re
from uuid import uuid4
from typing import List
from sqlalchemy.exc import SQLAlchemyError
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
import studio.consts as consts
import studio.tools.utils as tool_utils
import studio.cross_cutting.utils as cc_utils
from studio.proto.utils import is_field_set
from cmlapi import CMLServiceApi
import json
import shutil


def list_tool_templates(
    request: ListToolTemplatesRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> ListToolTemplatesResponse:
    """
    List all tool templates, including reading Python code and requirements from file paths.
    """
    try:
        with dao.get_session() as session:
            templates: List[db_model.ToolTemplate] = session.query(db_model.ToolTemplate).all()

            # Filter by workflow template
            if is_field_set(request, "workflow_template_id"):
                templates = list(filter(lambda x: x.workflow_template_id == request.workflow_template_id, templates))

            response_templates = []
            for template in templates:
                # Initialize variables
                python_code = ""
                python_requirements = ""
                is_valid = True

                # Attempt to read the Python code
                try:
                    python_code_file_path = os.path.join(template.source_folder_path, template.python_code_file_name)
                    with open(python_code_file_path, "r") as file:
                        python_code = file.read()
                except Exception:
                    is_valid = False

                # Validate the Python code if successfully read
                # NOTE: with tools v2, there is no need to validate tool code. Tool code
                # is the responsibility of the tool developer. We capture stdout in venv tools
                # so error handling is much easier.
                # validation_errors = []
                # if python_code:
                #     is_valid, validation_errors = tool_utils.validate_tool_code(python_code)

                # Attempt to read the Python requirements
                try:
                    python_requirements_file_path = os.path.join(
                        template.source_folder_path, template.python_requirements_file_name
                    )
                    with open(python_requirements_file_path, "r") as file:
                        python_requirements = file.read()
                except Exception:
                    is_valid = False

                # tool_metadata = json.dumps({"validation_errors": validation_errors})

                tool_image_uri = ""
                if template.tool_image_path:
                    tool_image_uri = os.path.relpath(template.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

                response_templates.append(
                    ToolTemplate(
                        id=template.id,
                        name=template.name,
                        python_code=python_code,
                        python_requirements=python_requirements,
                        source_folder_path=template.source_folder_path,
                        tool_metadata="{}",
                        is_valid=is_valid,
                        pre_built=template.pre_built,
                        tool_image_uri=tool_image_uri,
                        tool_description="",
                        workflow_template_id=template.workflow_template_id,
                        is_venv_tool=template.is_venv_tool,
                    )
                )

            return ListToolTemplatesResponse(templates=response_templates)

    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while listing tool templates: {e}")


def get_tool_template(
    request: GetToolTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> GetToolTemplateResponse:
    """
    Get details of a specific tool template, including reading Python code, requirements,
    and extracting user parameters from the wrapper function.
    """
    try:
        with dao.get_session() as session:
            template: db_model.ToolTemplate = (
                session.query(db_model.ToolTemplate).filter_by(id=request.tool_template_id).one_or_none()
            )
            if not template:
                raise ValueError(f"Tool template with ID '{request.tool_template_id}' not found.")

            # Initialize variables
            python_code = ""
            python_requirements = ""
            is_valid = True

            # Attempt to read the Python code
            try:
                python_code_file_path = os.path.join(template.source_folder_path, template.python_code_file_name)
                with open(python_code_file_path, "r") as file:
                    python_code = file.read()
            except Exception:
                is_valid = False

            # # Validate the Python code if successfully read
            # validation_errors = []
            # if python_code:
            #     is_valid, validation_errors = tool_utils.validate_tool_code(python_code)

            # Attempt to read the Python requirements
            try:
                python_requirements_file_path = os.path.join(
                    template.source_folder_path, template.python_requirements_file_name
                )
                with open(python_requirements_file_path, "r") as file:
                    python_requirements = file.read()
            except Exception:
                is_valid = False

            # Extract user parameters from the Python code
            user_params = []
            if python_code:
                try:
                    user_params = tool_utils.extract_user_params_from_code(python_code)
                except ValueError as e:
                    user_params = [f"Error parsing Python code: {e}"]

            # Create tool_metadata as a JSON string
            tool_metadata = json.dumps({"user_params": user_params})

            tool_image_uri = ""
            if template.tool_image_path:
                tool_image_uri = os.path.relpath(template.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

            # Convert the template to protobuf and set file content
            return GetToolTemplateResponse(
                template=ToolTemplate(
                    id=template.id,
                    name=template.name,
                    python_code=python_code,
                    python_requirements=python_requirements,
                    source_folder_path=template.source_folder_path,
                    tool_metadata=tool_metadata,
                    is_valid=is_valid,
                    pre_built=template.pre_built,
                    tool_image_uri=tool_image_uri,
                    tool_description="",
                    workflow_template_id=template.workflow_template_id,
                    is_venv_tool=template.is_venv_tool,
                )
            )

    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while retrieving tool template: {e}")


def add_tool_template(
    request: AddToolTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> AddToolTemplateResponse:
    """
    Add a new tool template.

    NOTE: this will now only create "venv tools", as the original tool
    specification is being deprecated.
    """
    try:
        # Validate tool template name
        if not re.match(r"^[a-zA-Z0-9 ]+$", request.tool_template_name):
            raise ValueError(
                "Tool template name must only contain alphabets, numbers, and spaces, and must not contain special characters."
            )

        # Sanitize the tool template name
        tool_class_name = "".join(word.lower().capitalize() for word in request.tool_template_name.strip().split())
        tool_uuid = str(uuid4())

        # Define directory paths
        tool_dir_basename = (
            cc_utils.create_slug_from_name(request.tool_template_name) + "_" + cc_utils.get_random_compact_string()
        )
        root_tool_dir = consts.TOOL_TEMPLATE_CATALOG_LOCATION
        tool_dir = os.path.join(root_tool_dir, tool_dir_basename)

        # Check for uniqueness of tool template name before creating files
        with dao.get_session() as session:
            existing_template = session.query(db_model.ToolTemplate).filter_by(name=request.tool_template_name).first()
            if existing_template:
                raise ValueError("A tool template with this name already exists.")

        # Create the .tool directory and tool template folder
        try:
            os.makedirs(tool_dir, exist_ok=True)
            shutil.copytree(consts.TOOL_TEMPLATE_SAMPLE_DIR, tool_dir, dirs_exist_ok=True)
        except Exception as e:
            # Cleanup the directory if something fails
            if os.path.exists(tool_dir):
                os.rmdir(tool_dir)
            raise RuntimeError(f"Failed to create tool template files: {e}")

        # Copy the tool image to the tool template folder
        tool_image_path = ""
        if request.tmp_tool_image_path:
            if not os.path.exists(request.tmp_tool_image_path):
                raise ValueError(f"Tool image path '{request.tmp_tool_image_path}' does not exist.")
            _, ext = os.path.splitext(request.tmp_tool_image_path)
            ext = ext.lower()
            if ext not in [".png", ".jpg", ".jpeg"]:
                raise ValueError(f"Tool image must be PNG, JPG or JPEG format. Got: {ext}")
            tool_image_path = os.path.join(consts.TOOL_TEMPLATE_ICONS_LOCATION, f"{tool_dir_basename}_icon{ext}")
            shutil.copy(request.tmp_tool_image_path, tool_image_path)
            os.remove(request.tmp_tool_image_path)
        # Proceed with database entry
        with dao.get_session() as session:
            tool_template = db_model.ToolTemplate(
                id=tool_uuid,
                name=request.tool_template_name,
                python_code_file_name="tool.py",
                python_requirements_file_name="requirements.txt",
                source_folder_path=tool_dir,
                tool_image_path=tool_image_path,
                workflow_template_id=request.workflow_template_id if request.workflow_template_id else None,
                is_venv_tool=True,
            )
            session.add(tool_template)
            session.commit()

            return AddToolTemplateResponse(tool_template_id=tool_template.id)

    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while adding tool template: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while adding tool template: {e}")


def update_tool_template(
    request: UpdateToolTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> UpdateToolTemplateResponse:
    """
    Update an existing tool template.
    """
    try:
        with dao.get_session() as session:
            # Fetch the existing tool template
            tool_template = session.query(db_model.ToolTemplate).filter_by(id=request.tool_template_id).one_or_none()
            if not tool_template:
                raise ValueError(f"Tool template with ID '{request.tool_template_id}' not found.")

            if tool_template.pre_built:
                raise ValueError(
                    f"Tool template with ID '{request.tool_template_id}' is pre-built and cannot be updated."
                )

            tool_dir = os.path.join(tool_template.source_folder_path)
            if not os.path.exists(tool_dir):
                raise ValueError(f"Tool template directory '{tool_dir}' does not exist.")

            # Update database fields
            if request.tool_template_name:
                tool_template.name = request.tool_template_name
                existing_template = (
                    session.query(db_model.ToolTemplate)
                    .filter(
                        db_model.ToolTemplate.name == request.tool_template_name,
                        db_model.ToolTemplate.id != request.tool_template_id,
                    )
                    .one_or_none()
                )
                if existing_template:
                    raise ValueError(f"A tool template with the name '{request.tool_template_name}' already exists.")
            if request.tmp_tool_image_path:
                # Validate temporary image file exists and has valid extension
                if not os.path.exists(request.tmp_tool_image_path):
                    raise ValueError(f"Temporary tool image file '{request.tmp_tool_image_path}' does not exist")

                _, ext = os.path.splitext(request.tmp_tool_image_path)
                ext = ext.lower()
                if ext not in [".png", ".jpg", ".jpeg"]:
                    raise ValueError(f"Invalid image file extension '{ext}'. Must be .png, .jpg, or .jpeg")

                tool_dir_basename = os.path.basename(tool_dir)
                tool_image_path = os.path.join(consts.TOOL_TEMPLATE_ICONS_LOCATION, f"{tool_dir_basename}_icon{ext}")
                shutil.copy(request.tmp_tool_image_path, tool_image_path)
                tool_template.tool_image_path = tool_image_path
                os.remove(request.tmp_tool_image_path)
            session.commit()

            return UpdateToolTemplateResponse(tool_template_id=tool_template.id)

    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while updating tool template: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while updating tool template: {e}")


def remove_tool_template(
    request: RemoveToolTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> RemoveToolTemplateResponse:
    """
    Remove a specific tool template.
    """
    try:
        with dao.get_session() as session:
            template = session.query(db_model.ToolTemplate).filter_by(id=request.tool_template_id).one_or_none()
            if not template:
                raise ValueError(f"Tool template with ID '{request.tool_template_id}' not found.")

            if template.pre_built:
                raise ValueError(
                    f"Tool template with ID '{request.tool_template_id}' is pre-built and cannot be removed."
                )

            # Remove the tool code folder
            if template.source_folder_path:
                try:
                    if os.path.exists(template.source_folder_path):
                        shutil.rmtree(template.source_folder_path)
                except Exception as e:
                    raise ValueError(f"Failed to delete tool template code folder: {e}")

            if template.tool_image_path:
                try:
                    if os.path.exists(template.tool_image_path):
                        os.remove(template.tool_image_path)
                except Exception as e:
                    print(f"Failed to delete tool template image: {e}")
            session.delete(template)
            session.commit()
        return RemoveToolTemplateResponse()

    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while removing tool template: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while removing tool template: {e}")
