# Write Markdown to Shared PDF Tool

Writes markdown content to a PDF file relative to the shared workflow directory. The workflow directory is located at `(agent_studio_root)/studio-data/workflows/<my_workflow>/*`.

## Description

This tool converts markdown content into professionally formatted PDF documents within the Agent Studio workflow environment. It uses the markdown-it-py and weasyprint library to render markdown syntax into high-quality PDF output with optimized formatting and layout.

## Parameters

### Tool Parameters

- **output_file** (str, required): The workflow-relative local path to the PDF file to write. Example: `'report.pdf'`
- **markdown_content** (str, required): The markdown content to write to the PDF file.

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "output_file": "report.pdf",
  "markdown_content": "# My Report\n\nThis is the content of my report."
}
```

## Example

To create a PDF report with formatted content:

```json
{
  "output_file": "monthly_report.pdf",
  "markdown_content": "# Monthly Sales Report\n\n## Executive Summary\n\nSales increased by **15%** this month.\n\n### Key Metrics\n\n- Total Revenue: $50,000\n- New Customers: 125\n- Customer Satisfaction: 4.8/5\n\n## Detailed Analysis\n\nThe following factors contributed to our success:\n\n1. Improved marketing campaigns\n2. Better customer service\n3. Product enhancements\n\n> \"This was our best month yet!\" - Sales Director"
}
```

The tool will return confirmation of the created file with the path relative to the workflow directory:

```json
{
  "path": "monthly_report.pdf"
}
```

## Output Structure

The tool returns a JSON object with the following structure:

```json
{
  "path": "string containing the path to the created PDF file"
}
```

## Supported Markdown Features

The tool supports standard markdown syntax including:

- **Headers**: `# H1`, `## H2`, `### H3`, etc.
- **Text Formatting**: `**bold**`, `*italic*`, `~~strikethrough~~`
- **Lists**: Ordered (`1. item`) and unordered (`- item`) lists
- **Links**: `[text](url)` format
- **Images**: `![alt](image_path)` format
- **Code**: Inline `code` and code blocks with ```
- **Blockquotes**: `> quoted text`
- **Tables**: Standard markdown table syntax
- **Horizontal Rules**: `---` or `***`

## Implementation Details

- Uses the `markdown_pdf` library for high-quality PDF generation
- Configured with `toc_level=2` for table of contents support
- Optimization enabled for better performance and file size
- Operates within the workflow directory context for security and consistency
- Returns structured output using the `OUTPUT_KEY` mechanism

## Error Handling

The tool will raise appropriate errors if:
- The output directory path does not exist or is not writable
- There are permission issues creating the PDF file
- The markdown content contains invalid syntax that cannot be processed
- Required dependencies are not installed

## Features

- **Professional Formatting**: Generates clean, professional-looking PDF documents
- **Markdown Support**: Full support for standard markdown syntax and formatting
- **Optimized Output**: PDF files are optimized for size and quality
- **Table of Contents**: Automatic TOC generation based on headers (when enabled)
- **Cross-Platform**: Works consistently across different operating systems

## Limitations

- Large markdown content may take longer to process and generate
- Complex HTML embedded in markdown may not render perfectly
- Image paths must be accessible from the workflow directory
- Some advanced markdown extensions may not be supported

## File Structure

```
write_markdown_to_shared_pdf/
├── tool.py          # Main tool implementation
├── README.md        # This documentation
└── (workflow files) # Generated PDF files in the workflow directory
```