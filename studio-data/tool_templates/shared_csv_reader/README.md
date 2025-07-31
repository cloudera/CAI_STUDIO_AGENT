# Shared CSV Reader Tool

A simple CSV reader tool that can read CSVs from a given path, relative to the shared workflow directory. The workflow directory is located at `(agent_studio_root)/studio-data/workflows/<my_workflow>/*`.

## Description

This tool provides an easy way to read and display CSV files within the Agent Studio workflow environment. It uses pandas to parse CSV files and returns the data as a formatted string representation, making it convenient for data analysis and processing workflows.

## Parameters

### Tool Parameters

- **filepath** (str, required): The local path to the CSV file to read, relative to the workflow directory.

### User Parameters

Currently, this tool does not require any user-specific configuration parameters.

## Usage

The tool can be called with the following parameter structure:

```json
{
  "filepath": "data.csv"
}
```

## Example

To read a CSV file named `sales_data.csv` located in your workflow directory:

```json
{
  "filepath": "sales_data.csv"
}
```

The tool will return the CSV content as a formatted string table:

```
    Name  Age         City
0   John   25     New York
1   Jane   30  Los Angeles
2    Bob   35      Chicago
```

## Output Format

The tool returns the CSV data as a string representation of a pandas DataFrame, which includes:
- Column headers
- Row indices (0, 1, 2, ...)
- Properly formatted and aligned data
- All data types preserved and displayed appropriately

## Implementation Details

- Uses pandas `read_csv()` function for robust CSV parsing
- Operates within the workflow directory context for security and consistency
- Returns data using pandas DataFrame `to_string()` method for readable formatting
- Handles various CSV formats and encoding automatically through pandas
- Returns structured output using the `OUTPUT_KEY` mechanism

## Error Handling

The tool will raise appropriate errors if:
- The specified CSV file does not exist in the workflow directory
- The file is not a valid CSV format
- There are permission issues accessing the file
- The CSV file is corrupted or contains parsing errors

## Limitations

- Large CSV files may consume significant memory and tokens when loaded entirely
- Output is returned as a string representation, not structured data
- Limited to CSV format (not Excel, TSV, or other tabular formats)
