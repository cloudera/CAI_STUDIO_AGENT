# Shared JSON Reader Tool

A simple JSON reader tool that can read JSON files from a given path, relative to the shared workflow directory. The workflow directory is located at `(agent_studio_root)/studio-data/workflows/<my_workflow>/*`.

## Description

This tool provides an easy way to read and display JSON files within the Agent Studio workflow environment. It loads JSON data from files and returns the content as a formatted JSON string with proper indentation, making it convenient for data analysis and processing workflows.

## Parameters

### Tool Parameters

- **filepath** (str, required): The local path to the JSON file to read, relative to the workflow directory.

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "filepath": "data.json"
}
```

## Example

To read a JSON file named `config.json` located in your workflow directory:

```json
{
  "filepath": "config.json"
}
```

If `config.json` contains:
```json
{"name": "John", "age": 30, "settings": {"theme": "dark", "notifications": true}}
```

The tool will return the JSON content formatted with 2-space indentation:

```json
{
  "name": "John",
  "age": 30,
  "settings": {
    "theme": "dark",
    "notifications": true
  }
}
```

## Output Format

The tool returns the JSON data as a formatted string with:
- 2-space indentation for readability
- Proper JSON structure preservation
- All data types maintained (strings, numbers, booleans, arrays, objects)
- UTF-8 encoding support

## Implementation Details

- Uses Python's built-in `json.load()` function for robust JSON parsing
- Operates within the workflow directory context for security and consistency
- Returns data using `json.dumps()` with 2-space indentation for readable formatting
- Handles nested JSON structures and complex data types automatically
- Returns structured output using the `OUTPUT_KEY` mechanism

## Error Handling

The tool will raise appropriate errors if:
- The specified JSON file does not exist in the workflow directory
- The file is not valid JSON format
- There are permission issues accessing the file
- The JSON file contains syntax errors or is corrupted

## Features

- **Pretty Formatting**: Returns well-formatted JSON with consistent 2-space indentation
- **Type Preservation**: Maintains all JSON data types (strings, numbers, booleans, null, arrays, objects)
- **Unicode Support**: Handles international characters and special symbols correctly
- **Nested Structure Support**: Processes complex nested JSON objects and arrays
- **Memory Efficient**: Loads and processes JSON files efficiently

## Limitations

- Large JSON files may consume significant memory and tokens when loaded entirely
- Output is returned as a formatted string representation
- Limited to valid JSON format only
- Entire file is loaded into memory at once
