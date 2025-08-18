"""
Secure File List/Read/Write/Delete Tool

This tool operates strictly within the current session directory, as provided by the
environment variable SESSION_DIRECTORY. It reads, writes, deletes, and lists files
under that directory only, supporting various file formats for reading and writing.

Security Features:
- Restricts file operations to the SESSION_DIRECTORY
- Only accepts file names (not paths) to prevent directory traversal
- Validates file paths to ensure they stay within the session directory

Supported Operations:
- LIST: Recursively list all files in the session directory with metadata
- READ: Extract content from existing files
- WRITE: Create new files or overwrite existing files with structured data
- DELETE: Remove existing files from the session directory
"""

from textwrap import dedent
from typing import Type, Optional, Tuple, Dict, Any, List
from pydantic import BaseModel, Field, validator
import os
import json
import markdown
import sqlite3
import pytesseract
import pandas as pd
from PyPDF2 import PdfReader
from docx import Document
from PIL import Image
from zipfile import ZipFile
from bs4 import BeautifulSoup
from striprtf.striprtf import rtf_to_text
from pydantic import BaseModel as StudioBaseTool
import argparse 
import mimetypes
from datetime import datetime
import stat as stat_module


class UserParameters(BaseModel):
    """
    Parameters placeholder for compatibility.

    NOTE: This tool no longer requires a workspace directory to be passed in user parameters.
    The session directory is discovered from the environment variable SESSION_DIRECTORY.
    Provide an empty JSON object {} for user parameters.
    """
    pass


class ToolParameters(BaseModel):
    """
    Arguments for the file read/write/delete tool.
    """
    operation: str = Field(
        default="list",
        description="Operation to perform: 'list' to list session files, 'read' to read existing file content, 'write' to write data to file, 'delete' to remove file"
    )
    file_name: str = Field(
        default="",
        description="Name of the file to be read, written, or deleted (e.g., 'document.pdf', 'data.xlsx', 'output.json'). "
                    "Must be a file name only, not a path. Not required for 'list' operation."
    )
    data: str = Field(
        default="",
        description="Data to write to the file (required for write operations, ignored for read/delete operations). Should be in the appropriate format for the file type (JSON string for .json, CSV string for .csv, plain text for .txt, etc.)"
    )
    data_format: str = Field(
        default="auto",
        description="Format of the data being written (only used for write operations): 'json', 'csv', 'text', 'html', 'markdown', 'xml', or 'auto' to detect from file extension"
    )
    
    @validator('operation')
    def validate_operation(cls, v):
        """Validate that operation is 'read', 'write', or 'delete'."""
        if v not in ['list', 'read', 'write', 'delete']:
            raise ValueError("Operation must be 'list', 'read', 'write', or 'delete'")
        return v
    
    @validator('data_format')
    def validate_data_format(cls, v):
        """Validate that data format is supported."""
        supported_formats = ['auto', 'json', 'csv', 'excel', 'text', 'html', 'markdown', 'xml']
        if v not in supported_formats:
            raise ValueError(f"Data format must be one of: {', '.join(supported_formats)}")
        return v
    
    @validator('file_name')
    def validate_file_name(cls, v, values, **kwargs):
        """Validate that the file name is safe and doesn't contain path separators."""
        operation = values.get('operation', 'read')
        if operation == 'list':
            # No filename required for list operation
            return v or ""
        if not v or not isinstance(v, str):
            raise ValueError("File name must be a non-empty string")
        
        # Validate filename doesn't contain path traversal attempts or separators
        if '..' in v or '/' in v or '\\' in v or ':' in v:
            raise ValueError("File name cannot contain path separators, '..' sequences, or ':' characters")
        
        # Check if it's just whitespace
        if v.strip() != v or len(v.strip()) == 0:
            raise ValueError("File name cannot contain leading/trailing whitespace or be empty")
        
        return v


def get_session_directory() -> str:
    """
    Resolve and validate the session directory from the environment variable SESSION_DIRECTORY.
    """
    session_directory = os.getenv('SESSION_DIRECTORY')
    if not session_directory:
        raise ValueError("Environment variable SESSION_DIRECTORY is not set")
    resolved_path = os.path.abspath(session_directory)
    if not os.path.exists(resolved_path):
        raise ValueError(f"Session directory does not exist: {resolved_path}")
    if not os.path.isdir(resolved_path):
        raise ValueError(f"Session path is not a directory: {resolved_path}")
    return resolved_path


def validate_file_path(workspace_path: str, file_name: str) -> str:
    """
    Validate and construct the full file path within the session directory.
    
    Args:
        workspace_path: Path to the session directory
        file_name: Name of the file
        
    Returns:
        Full path to the file
        
    Raises:
        ValueError: If the file path is unsafe or outside the session directory
    """
    # Construct the full path
    full_path = os.path.join(workspace_path, file_name)
    
    # Resolve to absolute path to prevent traversal
    resolved_path = os.path.abspath(full_path)
    resolved_workspace = os.path.abspath(workspace_path)
    
    # Ensure the resolved path is within the session directory
    if not resolved_path.startswith(resolved_workspace + os.sep) and resolved_path != resolved_workspace:
        raise ValueError(f"File path attempts to access outside session directory: {file_name}")
    
    return resolved_path


def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    """
    Main file listing/reading/writing/deletion logic restricted to the session directory.
    
    Args:
        config: Placeholder object (not used)
        args: Tool arguments containing operation, file name, and data
        
    Returns:
        Listing result, file content, write confirmation, delete confirmation, or error message
    """
    workspace_path = get_session_directory()
    file_name = args.file_name
    operation = args.operation
    
    try:
        if operation == "list":
            return handle_list_operation(workspace_path)

        # Validate and construct the file path for other operations
        file_path = validate_file_path(workspace_path, file_name)
        
        if operation == "read":
            return handle_read_operation(file_path, file_name, workspace_path)
        elif operation == "write":
            return handle_write_operation(file_path, file_name, workspace_path, args.data, args.data_format)
        elif operation == "delete":
            return handle_delete_operation(file_path, file_name, workspace_path)
        else:
            return {
                "status": "error",
                "error_message": f"Unknown operation: {operation}",
                "workspace_path": workspace_path
            }

    except ValueError as e:
        return {
            "status": "error",
            "error_message": f"Validation error: {str(e)}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    except UnicodeDecodeError:
        return {
            "status": "error",
            "error_message": f"Unable to decode file {file_name}. It might be a binary or unsupported format.",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    except PermissionError:
        return {
            "status": "error",
            "error_message": f"Permission denied for file {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Unexpected error: {str(e)}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }


def estimate_token_count(text: str) -> int:
    """
    Estimate token count using a simple heuristic.
    Rule of thumb: 1 token ≈ 4 characters for English text
    """
    if not text:
        return 0
    return len(text) // 4


def truncate_content_for_llm(content: str, max_tokens: int = 10000) -> tuple[str, bool, dict]:
    """
    Truncate content based on estimated token count to prevent LLM API failures.
    
    Args:
        content: The content to check and potentially truncate
        max_tokens: Maximum number of tokens allowed (default: 10000)
        
    Returns:
        Tuple of (truncated_content, was_truncated, truncation_info)
    """
    if not content:
        return content, False, {}
    
    # Estimate current token count
    estimated_tokens = estimate_token_count(content)
    
    if estimated_tokens <= max_tokens:
        return content, False, {}
    
    # Calculate target character count for truncation
    target_chars = max_tokens * 4  # 4 chars per token approximation
    
    # Truncate to target character count from the BEGINNING, and try to end at a word boundary
    if len(content) <= target_chars:
        truncated_content = content
    else:
        # Take the first portion of the content
        truncated_content = content[:target_chars]
        # Try to end at last complete word (avoid cutting the last word)
        last_space = truncated_content.rfind(' ')
        if last_space != -1 and last_space > target_chars * 0.8:  # If a space exists in the last 20%
            truncated_content = truncated_content[:last_space]
    
    # Calculate stats
    words = content.split()
    truncated_words = truncated_content.split()
    
    truncation_info = {
        "total_estimated_tokens": estimated_tokens,
        "tokens_shown": estimate_token_count(truncated_content),
        "total_words": len(words),
        "words_shown": len(truncated_words),
        "reduction_percentage": round((1 - len(truncated_content) / len(content)) * 100, 1)
    }
    
    return truncated_content, True, truncation_info


def handle_list_operation(workspace_path: str) -> dict:
    """
    Recursively list all files within the session directory, returning rich metadata.
    """
    files: List[Dict[str, Any]] = []
    total_size = 0
    for root, dirs, filenames in os.walk(workspace_path):
        # Skip symlinks to avoid escaping workspace unintentionally and skip hidden directories (e.g., .venv)
        dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d)) and not d.startswith('.')]
        for fname in filenames:
            # Skip hidden files (starting with a dot) and symlinked files
            if fname.startswith('.'):  
                continue
            abs_path = os.path.join(root, fname)
            # Skip symlinked files
            if os.path.islink(abs_path):
                continue
            try:
                stat = os.stat(abs_path)
                size = stat.st_size
                total_size += size
                rel_path = os.path.relpath(abs_path, workspace_path)
                ext = os.path.splitext(fname)[-1].lower()
                mime, _ = mimetypes.guess_type(abs_path)
                files.append({
                    "file_name": fname,
                    "relative_path": rel_path,
                    "size_bytes": size,
                    "modified_time_iso": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "created_time_iso": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "accessed_time_iso": datetime.fromtimestamp(stat.st_atime).isoformat(),
                    "extension": ext,
                    "mime_type": mime or "application/octet-stream",
                    "owner_uid": stat.st_uid,
                    "owner_gid": stat.st_gid,
                    "mode": stat.st_mode,
                    "mode_octal": oct(stat.st_mode & 0o777),
                })
            except Exception:
                # Best-effort listing; continue on errors
                continue
    return {
        "status": "success",
        "operation": "list",
        "workspace_path": workspace_path,
        "total_files": len(files),
        "total_size_bytes": total_size,
        "files": files,
    }


def handle_read_operation(file_path: str, file_name: str, workspace_path: str) -> dict:
    """
    Handle file reading operations with content length limits.
    """
    # Check if file exists
    if not os.path.exists(file_path):
        return {
            "status": "error",
            "error_message": f"File not found: {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    
    # Check if it's actually a file (not a directory)
    if not os.path.isfile(file_path):
        return {
            "status": "error", 
            "error_message": f"Path is not a file: {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }

    file_extension = os.path.splitext(file_path)[-1].lower()
    
    # Extract content based on file type
    content = None
    match file_extension:
        case ".pdf": 
            content = extract_text_from_pdf(file_path)
        case ".docx": 
            content = extract_text_from_docx(file_path)
        case ".png" | ".jpg" | ".jpeg": 
            content = extract_text_from_image(file_path)
        case ".xlsx" | ".xls": 
            content = extract_text_from_excel(file_path)
        case ".rtf": 
            content = extract_text_from_rtf(file_path)
        case ".zip": 
            content = extract_text_from_zip(file_path)
        case ".json": 
            content = extract_text_from_json(file_path)
        case ".html": 
            content = extract_text_from_html(file_path)
        case ".md": 
            content = extract_text_from_markdown(file_path)
        case ".sqlite" | ".db": 
            content = extract_text_from_sqlite(file_path)
        case _: 
            content = extract_text_from_text_file(file_path)
    
    # Check and truncate content if needed (token-based for LLM safety)
    truncated_content, was_truncated, truncation_info = truncate_content_for_llm(content)
    
    result = {
        "status": "success",
        "operation": "read",
        "file_name": file_name,
        "file_path": file_path,
        "file_extension": file_extension,
        "workspace_path": workspace_path,
        "content": truncated_content,
        "content_length": len(str(content)) if content else 0,
        "displayed_length": len(str(truncated_content)) if truncated_content else 0
    }
    
    # Add truncation information if content was truncated
    if was_truncated:
        result.update({
            "content_truncated": True,
            "truncation_warning": f"⚠️ Content too long for LLM processing! Showing FIRST ~{truncation_info['tokens_shown']} tokens out of ~{truncation_info['total_estimated_tokens']} total tokens ({truncation_info['reduction_percentage']}% reduced from end).",
            "full_content_message": "💡 Large file detected. Use file processing tools or chunking strategies to analyze the complete content programmatically.",
            "truncation_details": truncation_info,
            "llm_safety_note": "Content truncated to prevent LLM API failures and ensure reliable processing."
        })
    else:
        result["content_truncated"] = False
    
    return result


def handle_write_operation(file_path: str, file_name: str, workspace_path: str, data: str, data_format: str) -> dict:
    """
    Handle file writing operations.
    """
    if not data:
        return {
            "status": "error",
            "error_message": "No data provided for write operation",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    
    file_extension = os.path.splitext(file_path)[-1].lower()
    
    # Determine format from file extension if auto
    if data_format == "auto":
        format_map = {
            ".json": "json",
            ".csv": "csv", 
            ".xlsx": "excel",
            ".xls": "excel",
            ".html": "html",
            ".md": "markdown",
            ".xml": "xml",
            ".txt": "text"
        }
        data_format = format_map.get(file_extension, "text")
    
    try:
        # Write data based on format
        if data_format == "json":
            write_json_file(file_path, data)
        elif data_format == "csv":
            write_csv_file(file_path, data)
        elif data_format == "excel":
            write_excel_file(file_path, data)
        elif data_format == "html":
            write_html_file(file_path, data)
        elif data_format == "markdown":
            write_markdown_file(file_path, data)
        elif data_format == "xml":
            write_xml_file(file_path, data)
        else:  # text or default
            write_text_file(file_path, data)
        
        # Get file size after writing
        file_size = os.path.getsize(file_path)
        
        return {
            "status": "success",
            "operation": "write",
            "file_name": file_name,
            "file_path": file_path,
            "file_extension": file_extension,
            "workspace_path": workspace_path,
            "data_format": data_format,
            "bytes_written": file_size,
            "message": f"Successfully wrote {file_size} bytes to {file_name}"
        }
        
    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "error_message": f"Invalid JSON data: {str(e)}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to write file: {str(e)}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }


def handle_delete_operation(file_path: str, file_name: str, workspace_path: str) -> dict:
    """
    Handle file deletion operations.
    """
    # Check if file exists
    if not os.path.exists(file_path):
        return {
            "status": "error",
            "error_message": f"File not found: {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    
    # Check if it's actually a file (not a directory)
    if not os.path.isfile(file_path):
        return {
            "status": "error", 
            "error_message": f"Path is not a file: {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    
    # Get file info before deletion
    file_size = os.path.getsize(file_path)
    file_extension = os.path.splitext(file_path)[-1].lower()
    
    try:
        # Delete the file
        os.remove(file_path)
        
        return {
            "status": "success",
            "operation": "delete",
            "file_name": file_name,
            "file_path": file_path,
            "file_extension": file_extension,
            "workspace_path": workspace_path,
            "file_size_deleted": file_size,
            "message": f"Successfully deleted {file_name} ({file_size} bytes)"
        }
        
    except PermissionError:
        return {
            "status": "error",
            "error_message": f"Permission denied - cannot delete file: {file_name}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to delete file: {str(e)}",
            "workspace_path": workspace_path,
            "requested_file": file_name
        }


def extract_text_from_text_file(file_path: str) -> str:
    """Reads plain text files."""
    with open(file_path, "r", encoding="utf-8") as file:
        return file.read()

def extract_text_from_json(file_path: str) -> str:
    """Extracts formatted JSON content."""
    with open(file_path, "r", encoding="utf-8") as file:
        return json.dumps(json.load(file), indent=4)

def extract_text_from_image(file_path: str) -> str:
    """Uses OCR to extract text from images."""
    return pytesseract.image_to_string(Image.open(file_path))

def extract_text_from_pdf(file_path: str) -> str:
    """Extracts text from a PDF, falling back to OCR if necessary."""
    text = ""
    reader = PdfReader(file_path)
    for page in reader.pages:
        text += page.extract_text() or extract_text_from_image(file_path)
    return text.strip() or "No readable text found in PDF."

def extract_text_from_docx(file_path: str) -> str:
    """Extracts text from Word (.docx) files."""
    return "\n".join(para.text for para in Document(file_path).paragraphs)

def extract_text_from_excel(file_path: str) -> str:
    """Extracts content from Excel files as CSV format."""
    return pd.read_excel(file_path).to_csv(index=False)

def extract_text_from_html(file_path: str) -> str:
    """Extracts text content from an HTML file."""
    with open(file_path, "r", encoding="utf-8") as file:
        return BeautifulSoup(file.read(), "html.parser").get_text()

def extract_text_from_markdown(file_path: str) -> str:
    """Extracts plain text from a Markdown (.md) file."""
    with open(file_path, "r", encoding="utf-8") as file:
        md_content = file.read()
        html_content = markdown.markdown(md_content)  # Convert Markdown to HTML
        soup = BeautifulSoup(html_content, "html.parser")  # Parse HTML
        return soup.get_text()  # Extract and return plain text

def extract_text_from_sqlite(file_path: str) -> str:
    """Extracts table data from an SQLite database."""
    conn = sqlite3.connect(file_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    content = ""
    for table in tables:
        cursor.execute(f"SELECT * FROM {table[0]}")
        content += f"Table: {table[0]}\n" + "\n".join(map(str, cursor.fetchall())) + "\n"
    conn.close()
    return content.strip() or "No data found in SQLite database."

def extract_text_from_rtf(file_path: str) -> str:
    """Extracts text from an RTF file."""
    with open(file_path, "r", encoding="utf-8") as file:
        return rtf_to_text(file.read())

def extract_text_from_zip(file_path: str) -> str:
    """Extracts text-based file contents from a ZIP archive."""
    with ZipFile(file_path, 'r') as zip_ref:
        content = ""
        for file_name in zip_ref.namelist():
            if file_name.endswith(('.txt', '.csv', '.json', '.xml', '.md')):
                with zip_ref.open(file_name) as file:
                    content += file.read().decode('utf-8') + "\n"
        return content.strip() or "No text-based files found in ZIP."


# Writing functions for different file formats
def write_text_file(file_path: str, data: str) -> None:
    """Write plain text to a file."""
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(data)


def write_json_file(file_path: str, data: str) -> None:
    """
    Write JSON data to a file with proper formatting.
    
    Special behavior for execution.json files:
    - If the file already exists and contains a JSON list, new data is appended to the list
    - If the file doesn't exist, it creates a new list with the provided data
    - If the file exists but doesn't contain a valid list, it converts to a list and appends
    
    For all other JSON files, the standard overwrite behavior is used.
    """
    # Parse JSON to validate it
    json_data = json.loads(data)
    
    # Special handling for execution.json - append to existing list
    if os.path.basename(file_path).lower() == 'execution.json':
        existing_data = []
        
        # Read existing data if file exists
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    existing_content = f.read().strip()
                    if existing_content:
                        existing_data = json.loads(existing_content)
                        # Ensure existing data is a list
                        if not isinstance(existing_data, list):
                            existing_data = [existing_data]
            except (json.JSONDecodeError, Exception):
                # If file is corrupted or not valid JSON, start with empty list
                existing_data = []
        
        # Append new data to existing list
        if isinstance(json_data, list):
            # If new data is a list, extend the existing list
            existing_data.extend(json_data)
        else:
            # If new data is a single object, append it
            existing_data.append(json_data)
        
        # Write the updated list back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, indent=4, ensure_ascii=False)
    else:
        # Normal JSON file writing behavior
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=4, ensure_ascii=False)


def write_csv_file(file_path: str, data: str) -> None:
    """Write CSV data to a file."""
    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        f.write(data)


def write_html_file(file_path: str, data: str) -> None:
    """Write HTML content to a file."""
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(data)


def write_markdown_file(file_path: str, data: str) -> None:
    """Write Markdown content to a file."""
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(data)


def write_xml_file(file_path: str, data: str) -> None:
    """Write XML content to a file."""
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(data)


def write_excel_file(file_path: str, data: str) -> None:
    """Write data to Excel file. Expects CSV-formatted data."""
    import io
    # Parse CSV data and convert to Excel
    df = pd.read_csv(io.StringIO(data))
    df.to_excel(file_path, index=False)


OUTPUT_KEY="tool_output"




if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Secure File List/Read/Write/Delete Tool (SESSION_DIRECTORY scoped)")
    parser.add_argument("--user-params", required=False, default="{}", help="Deprecated. Ignored. Provide '{}' or omit. Session directory is taken from SESSION_DIRECTORY env var.")
    parser.add_argument("--tool-params", required=True, help="Tool arguments (operation: list/read/write/delete, file name, data, format)")
    args = parser.parse_args()
    
    try:
        # Parse JSON into dictionaries
        config_dict = json.loads(args.user_params) if args.user_params else {}
        params_dict = json.loads(args.tool_params)
        
        # Validate dictionaries against Pydantic models
        config = UserParameters(**config_dict)
        params = ToolParameters(**params_dict)

        output = run_tool(config, params)
        print(OUTPUT_KEY, output)
        
    except json.JSONDecodeError as e:
        error_output = {
            "status": "error",
            "error_message": f"Invalid JSON input: {str(e)}"
        }
        print(OUTPUT_KEY, error_output)
    except Exception as e:
        error_output = {
            "status": "error", 
            "error_message": f"Tool initialization failed: {str(e)}"
        }
        print(OUTPUT_KEY, error_output)