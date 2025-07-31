# Shared File Read Tool

Reads and extracts content from files in various formats relative to the shared workflow directory. The workflow directory is located at `(agent_studio_root)/studio-data/workflows/<my_workflow>/*`.

## Description

This tool provides a comprehensive file reading solution that can extract text content from a wide variety of file formats within the Agent Studio workflow environment. It automatically detects file types based on extensions and applies the appropriate extraction method, including OCR for images and PDFs when needed.

## Parameters

### Tool Parameters

- **file_path** (str, required): Path to the file to be read and processed, relative to the workflow directory.

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "file_path": "document.pdf"
}
```

## Supported File Formats

The tool supports a comprehensive range of file formats:

### Document Formats
- **PDF (.pdf)**: Extracts text with OCR fallback for scanned documents
- **Word Documents (.docx)**: Extracts text from Microsoft Word documents
- **RTF (.rtf)**: Rich Text Format documents
- **HTML (.html)**: Web pages with text extraction
- **Markdown (.md)**: Markdown files converted to plain text

### Data Formats
- **Excel (.xlsx, .xls)**: Spreadsheets converted to CSV format
- **JSON (.json)**: Formatted JSON with 4-space indentation
- **SQLite (.sqlite, .db)**: Database tables with structured output
- **CSV/Text (.csv, .txt)**: Plain text files

### Image Formats
- **Images (.png, .jpg, .jpeg)**: OCR text extraction using Tesseract

### Archive Formats
- **ZIP (.zip)**: Extracts text from supported files within archives

### Fallback
- **Other formats**: Attempts to read as plain text files

## Examples

### Reading a PDF Document
```json
{
  "file_path": "reports/quarterly_report.pdf"
}
```

### Reading an Excel File
```json
{
  "file_path": "data/sales_data.xlsx"
}
```
Returns data in CSV format for easy processing.

### Reading an Image with OCR
```json
{
  "file_path": "screenshots/error_message.png"
}
```
Uses optical character recognition to extract text from images.

### Reading a SQLite Database
```json
{
  "file_path": "databases/customer_data.db"
}
```
Returns structured table data from all tables in the database.

## Output Format

The tool returns extracted content as plain text strings. The format varies by file type:

- **Text files**: Raw content
- **PDFs/Word**: Extracted text content
- **Excel**: CSV-formatted data
- **JSON**: Pretty-printed JSON with 4-space indentation
- **Images**: OCR-extracted text
- **SQLite**: Table names and data in structured format
- **ZIP**: Combined content from all supported text files


## Implementation Details

- Automatically detects file format based on file extension
- Uses specialized extraction methods for each supported format
- OCR fallback for PDFs without extractable text
- Handles encoding issues gracefully with UTF-8 default
- Operates within the workflow directory context for security
- Returns structured output using the `OUTPUT_KEY` mechanism

## Error Handling

The tool provides comprehensive error handling for:

- **File Not Found**: Returns clear error message if file doesn't exist
- **Permission Denied**: Handles file access permission issues
- **Unicode Decode Errors**: Graceful handling of binary or unsupported formats
- **Format-Specific Errors**: Handles corruption or parsing issues for each file type
- **OCR Failures**: Provides fallback messages when text cannot be extracted

## Features

- **Multi-Format Support**: Handles 10+ different file formats automatically
- **OCR Capabilities**: Extracts text from images and scanned PDFs
- **Database Access**: Reads and formats SQLite database contents
- **Archive Processing**: Extracts multiple files from ZIP archives
- **Smart Fallbacks**: Attempts text extraction even for unknown formats
- **Encoding Safety**: Robust handling of different text encodings
- **Structured Output**: Consistent formatting across different file types

## Limitations

- OCR accuracy depends on image quality and text clarity
- Large files may consume significant memory and processing time
- Some complex PDF layouts may not extract perfectly
- ZIP processing limited to text-based files only
- Database extraction shows raw table data without schema information
- Binary files without text content will return error messages
