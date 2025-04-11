from textwrap import dedent
from typing import Type
from pydantic import BaseModel, Field
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


class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    file_path: str = Field(description="Path to the file to be read and processed.")


def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    file_path = args.file_path
    
    """Reads and extracts content from the given file."""
    if not os.path.exists(file_path):
        return f"Error: File not found at path {file_path}"

    file_extension = os.path.splitext(file_path)[-1].lower()

    try:
        match file_extension:
            case ".pdf": return extract_text_from_pdf(file_path)
            case ".docx": return extract_text_from_docx(file_path)
            case ".png" | ".jpg" | ".jpeg": return extract_text_from_image(file_path)
            case ".xlsx" | ".xls": return extract_text_from_excel(file_path)
            case ".rtf": return extract_text_from_rtf(file_path)
            case ".zip": return extract_text_from_zip(file_path)
            case ".json": return extract_text_from_json(file_path)
            case ".html": return extract_text_from_html(file_path)
            case ".md": return extract_text_from_markdown(file_path)
            case ".sqlite" | ".db": return extract_text_from_sqlite(file_path)
            case _: return extract_text_from_text_file(file_path)

    except UnicodeDecodeError:
        return f"Error: Unable to decode file {file_path}. It might be a binary or unsupported format."
    except PermissionError:
        return f"Error: Permission denied for file {file_path}"
    except Exception as e:
        return f"Error: {str(e)}"

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