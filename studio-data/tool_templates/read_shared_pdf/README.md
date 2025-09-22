# Read Shared PDF to Markdown Tool

Reads a text-based PDF from the shared workflow directory and returns the content as a Markdown-formatted string. The workflow directory is located at `(agent_studio_root)/studio-data/workflows/<my_workflow>/*`.

## Description

This tool converts PDF documents to Markdown format by extracting text content and applying intelligent formatting rules. It's designed to work with text-based PDFs within the Agent Studio workflow environment, making PDF content more accessible and easier to process programmatically.

## Parameters

### Tool Parameters

- **input_file** (str, required): The workflow-relative local path to the PDF file to read. Example: `'report.pdf'`

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "input_file": "report.pdf"
}
```

## Example

To convert a PDF file named `financial_report.pdf` located in your workflow directory:

```json
{
  "input_file": "financial_report.pdf"
}
```

The tool will return a structured output containing the Markdown content:

```json
{
  "markdown": "## EXECUTIVE SUMMARY\n\n**Revenue Overview:**\n\nTotal revenue for Q4 increased by 15%...\n\n---\n\n## FINANCIAL DETAILS\n..."
}
```

## Formatting Rules

The tool applies intelligent formatting when converting PDF text to Markdown:

- **Headings**: Uppercase lines with fewer than 10 words are converted to `## Heading` format
- **Bold Text**: Lines ending with a colon (`:`) are made bold using `**text:**` format  
- **Regular Text**: Standard paragraphs are preserved as-is
- **Page Breaks**: Each page is separated with a horizontal rule (`---`)

## Output Structure

The tool returns a JSON object with the following structure:

```json
{
  "markdown": "string containing the full markdown content"
}
```

## Dependencies

- **pdfplumber**: For PDF text extraction and processing
- **pydantic**: For parameter validation
- **Standard library modules**: json, argparse, os, pathlib


## Implementation Details

- Uses pdfplumber library for robust PDF text extraction
- Operates within the workflow directory context for security and consistency
- Processes each page individually and combines results
- Applies heuristic-based formatting to improve readability
- Returns structured output using the `OUTPUT_KEY` mechanism

## Error Handling

The tool will raise appropriate errors if:
- The specified PDF file does not exist in the workflow directory
- The PDF file is corrupted or cannot be opened
- There are permission issues accessing the file
- The PDF contains only images without extractable text

## Limitations

- Works best with text-based PDFs (not scanned documents)
- Formatting detection is heuristic-based and may not be perfect for all document types
- Complex layouts, tables, and graphics are converted to simple text format
- Requires pdfplumber library to be installed
