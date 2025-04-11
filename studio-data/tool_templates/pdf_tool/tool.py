from textwrap import dedent
from typing import Literal, Optional, List, Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
import PyPDF2
from pathlib import Path
from markdown import markdown
from weasyprint import HTML, CSS
import json 
import argparse 

class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    action: Literal["readpdf", "markdown_to_pdf"] = Field(description="Action type specifying the operation")
    pdf: str = Field(description="Path to the PDF file. For 'readpdf', this is the input PDF. For 'markdown_to_pdf', this is the output PDF path.",  default=None)
    raw: Optional[str] = Field(description="Raw Markdown string content for 'markdown_to_pdf'. If provided, this takes precedence over a file input.",  default=None)
    md: Optional[str] = Field(description="Path to the input Markdown file for 'markdown_to_pdf'.", default=None)
    css: Optional[str] = Field(description="Path to the CSS file for 'markdown_to_pdf'.",  default=None)
    base_url: Optional[str] = Field(description="Base URL for relative content paths (e.g., images, CSS files). Defaults to the current working directory.", default=None)
    extras: Optional[List[str]] = Field(description="Optional Markdown extensions for advanced features like tables, footnotes, etc., in 'markdown_to_pdf'.",  default=[])

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    action = args.action
    pdf = args.pdf 
    raw = args.raw 
    md = args.md 
    css = args.css 
    base_url = args.base_url 
    extras = args.extras 
    
    try:
        if action == "readpdf":
            # Validate the input PDF file path
            if not pdf:
                raise ValueError("PDF path ('pdf') is required for 'readpdf' action.")

            pdf_path = Path(pdf)
            if not pdf_path.exists():
                raise FileNotFoundError(f"PDF file not found: {pdf_path}")

            # Extract text from the PDF
            with pdf_path.open("rb") as pdf_file:
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                text_content = ""
                for page in pdf_reader.pages:
                    text_content += page.extract_text() + "\n"
            return text_content.strip()

        elif action == "markdown_to_pdf":
            # Validate the output PDF file path
            if not pdf:
                raise ValueError("Output PDF path ('pdf') is required for 'markdown_to_pdf' action.")

            # Create output folder for storing the PDF
            output_folder = Path("studio/artifacts")
            output_folder.mkdir(parents=True, exist_ok=True)
            pdf_path = output_folder / pdf

            # Load Markdown content
            md_path = Path(md) if md else None
            css_path = Path(css) if css else None
            base_path = Path(base_url) if base_url else Path.cwd()

            if md_path:
                raw_content = md_path.read_text()
            else:
                raw_content = raw

            if not raw_content or not raw_content.strip():
                raise ValueError("Input Markdown content is empty or invalid.")

            # Convert Markdown to HTML
            raw_html = markdown(raw_content, extensions=extras or [])

            # Create WeasyPrint HTML object
            html = HTML(string=raw_html, base_url=str(base_path))

            # Apply CSS styling if provided
            styles = [CSS(filename=str(css_path))] if css_path else []

            # Generate PDF from the HTML
            html.write_pdf(pdf_path, stylesheets=styles)
            return f"PDF successfully generated at {pdf_path}"

        else:
            raise ValueError(f"Unknown action type: {action}")

    except (ValueError, FileNotFoundError) as ve:
        return f"Validation error: {ve}"
    except Exception as e:
        return f"Unexpected error: {e}"
    
    
OUTPUT_KEY="tool_output"


    
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="JSON string for tool configuration")
    parser.add_argument("--tool-params", required=True, help="JSON string for tool arguments")
    args = parser.parse_args()
    
    # Parse JSON into dictionaries
    config_dict = json.loads(args.user_params)
    params_dict = json.loads(args.tool_params)
    
    # Validate dictionaries against Pydantic models
    config = UserParameters(**config_dict)
    params = ToolParameters(**params_dict)

    output = run_tool(
        config,
        params
    )
    print(OUTPUT_KEY, output)