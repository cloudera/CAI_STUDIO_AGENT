# JSON Reader Tool

A simple JSON reader tool that can read JSON files from a given path, relative to the tool's directory.

## Description

This tool provides a straightforward way to read and parse JSON files. It takes a file path as input, reads the JSON file, and returns the content as a formatted JSON string with proper indentation.

## Parameters

### Tool Parameters

- **filepath** (str, required): The local path to the JSON file to read, relative to the tool's directory.

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "filepath": "path/to/your/file.json"
}
```

## Example

If you have a JSON file located at `data/example.json` relative to the tool's directory, you would call the tool with:

```json
{
  "filepath": "data/example.json"
}
```

The tool will return the JSON content formatted with 2-space indentation.

## Implementation Details

- The tool uses Pydantic models for parameter validation
- JSON content is loaded and returned with 2-space indentation for readability
- The tool operates relative to its own directory for security and consistency
- Output is structured using the `OUTPUT_KEY` mechanism for clean agent communication

## Error Handling

The tool will raise appropriate errors if:
- The specified file path does not exist
- The file is not valid JSON
- There are permission issues accessing the file

## File Structure

```
json_reader/
├── tool.py          # Main tool implementation
├── README.md        # This documentation
└── [your JSON files]
```
