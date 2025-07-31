# CSV Reader

An Agent Studio tool template for reading CSV files relative to the tool's directory.

## Description

This tool provides a simple CSV reader that can read CSV files from a given path relative to the tool's directory. It uses pandas to parse CSV files and returns the content as a formatted string representation.

## Parameters

- `filepath` (string): The local path to the CSV file to read, relative to the tool's directory.

## Functionality

The tool:
1. Accepts a filepath parameter pointing to a CSV file
2. Reads the CSV file using pandas
3. Returns the CSV content as a string representation (using `df.to_string()`)

## Sample Data

To confirm that the tool is working, there are sample CSV files available:
- `data/sample1.csv`
- `data/sample2.csv`

## Dependencies

The tool requires pandas for CSV processing. Dependencies are listed in `requirements.txt`.

## Usage Example

The tool can be called with a filepath parameter like:
```json
{
  "filepath": "data/sample1.csv"
}
```

This will read the specified CSV file and return its contents as a formatted string that can be processed by the calling agent.
