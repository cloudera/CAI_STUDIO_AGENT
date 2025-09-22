"""
Reads a text-based PDF from the shared workflow directory and returns the content as a Markdown-formatted string. The workflow
directory is located at (agent_studio_root)/studio-data/workflows/<my_workflow>/*.
"""

from pydantic import BaseModel, Field
from typing import Optional, Any
import json
import argparse
import os
from pathlib import Path
import pdfplumber
import sys

# Our tool is stored in .../<workflow>/tools/<tool_name>/tool.py. So we need to go up 3 levels to get to the root of the workflow.
ROOT_DIR = Path(__file__).parent.parent.parent
sys.path.append(str(ROOT_DIR))
os.chdir(ROOT_DIR)


class UserParameters(BaseModel):
    pass


class ToolParameters(BaseModel):
    input_file: str = Field(description="The workflow-relative local path to the PDF file to read. example: 'report.pdf'")


def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    pdf_path = Path(args.input_file)
    if not pdf_path.exists():
        raise FileNotFoundError(f"File not found: {pdf_path}")

    markdown_lines = []

    with pdfplumber.open(pdf_path) as doc:
        for i, page in enumerate(doc.pages):
            text = page.extract_text() or ""
            lines = text.splitlines()

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Simple formatting guesses
                if line.isupper() and len(line.split()) < 10:
                    markdown_lines.append(f"## {line}")  # Heading
                elif line.endswith(":"):
                    markdown_lines.append(f"**{line}**")
                else:
                    markdown_lines.append(line)

            markdown_lines.append("\n---\n")  # Page break separator

    markdown = "\n\n".join(markdown_lines)
    return {
        "markdown": markdown.strip()
    }


OUTPUT_KEY = "tool_output"
"""
Tool output key.
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True)
    parser.add_argument("--tool-params", required=True)
    args = parser.parse_args()

    user_dict = json.loads(args.user_params)
    tool_dict = json.loads(args.tool_params)

    config = UserParameters(**user_dict)
    params = ToolParameters(**tool_dict)

    output = run_tool(config, params)
    print(OUTPUT_KEY, output)
