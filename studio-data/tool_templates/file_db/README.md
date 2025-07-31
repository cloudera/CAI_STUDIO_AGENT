# File Database Explorer

Run specific SQL queries against tabular files (CSV or Parquet) as if they were a database.

## Description

This tool provides a SQL-like querying interface for CSV and Parquet files using DuckDB. It allows you to perform database-style operations including filtering, ordering, grouping, and limiting results. The tool supports up to three filters that are combined with AND logic (not OR).

## Data Directory

This tool reads files relative to the tool directory. There is sample data available at data/sample1.csv, and an
example parquet file available at data/titanic.parquet.

## User Parameters

- `db_file` (string): The path to the database file to use for queries. Currently supports CSV and Parquet files.

## Tool Parameters

### Core Query Parameters
- `describe` (boolean): Set to `true` to describe the database table schema instead of querying data
- `column_names` (string): Comma-separated list of column names to return. Use `*` for all columns or SQL functions like `COUNT(*)`
- `limit` (integer): Number of rows to return
- `offset` (integer): Number of rows to skip before returning results
- `order_by` (string): Column name to sort results by
- `order_direction` (string): Sort direction - either `ASC` or `DESC`
- `group_by` (string): Column name to group results by

### Filter Parameters (up to 3 filters, combined with AND)

Each filter consists of three parts:

**Filter 1:**
- `filter_column_1` (string): Column name to filter on
- `filter_operation_1` (string): Operation type - one of:
  - `equal_to`: Exact match (=)
  - `contains`: Text contains pattern (LIKE)
  - `less_than`: Less than (<)
  - `greater_than`: Greater than (>)
  - `less_than_or_equal`: Less than or equal (<=)
  - `greater_than_or_equal`: Greater than or equal (>=)
  - `not_equal_to`: Not equal (!=)
- `filter_value_1` (any): Value to compare against

**Filter 2 & 3:** Same structure as Filter 1, with `_2` and `_3` suffixes respectively.

## Functionality

The tool:
1. Uses DuckDB to run SQL queries against CSV/Parquet files
2. Automatically handles data type detection (string vs numeric values)
3. Constructs SQL queries based on the provided parameters
4. Returns results in JSON format
5. Provides table schema information when using the `describe` parameter
6. Supports complex queries with filtering, ordering, grouping, and aggregation

## Sample Data

To test the tool functionality, sample files are available:
- `data/sample1.csv` - Sample CSV file
- `data/titanic.parquet` - Sample Parquet file with Titanic dataset

## Dependencies

The tool requires the following Python packages (see `requirements.txt`):
- `pydantic` - Data validation
- `duckdb` - SQL query engine
- `pandas` - Data manipulation
- `pyarrow` - Parquet file support

## Usage Examples

### 1. Describe table schema
```json
{
  "describe": true
}
```

### 2. Select all columns with limit
```json
{
  "column_names": "*",
  "limit": 10
}
```

### 3. Filter and sort data
```json
{
  "column_names": "name,age,fare",
  "filter_column_1": "age",
  "filter_operation_1": "greater_than",
  "filter_value_1": 30,
  "order_by": "fare",
  "order_direction": "DESC",
  "limit": 5
}
```

### 4. Count with multiple filters
```json
{
  "column_names": "COUNT(*)",
  "filter_column_1": "survived",
  "filter_operation_1": "equal_to",
  "filter_value_1": 1,
  "filter_column_2": "class",
  "filter_operation_2": "equal_to",
  "filter_value_2": "First"
}
```

### 5. Group by with aggregation
```json
{
  "column_names": "class, COUNT(*) as count",
  "group_by": "class",
  "order_by": "count",
  "order_direction": "DESC"
}
```

## Notes

- Multiple filters are combined with AND logic, not OR
- String values are automatically quoted in SQL queries
- Numeric values are detected and used without quotes
- The tool returns structured JSON output for easy processing by agents
- Error handling returns JSON with error messages for debugging