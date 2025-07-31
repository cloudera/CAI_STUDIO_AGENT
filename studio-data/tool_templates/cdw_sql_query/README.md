# CDW SQL Query Tool

This tool executes SQL queries on a configured database and returns the output as a Pandas DataFrame in text format. It connects to Cloudera Data Warehouse (CDW) using CML data connections.

## Description

This tool provides a robust interface for executing SQL queries against Cloudera Data Warehouse databases within the Agent Studio workflow environment. It uses CML (Cloudera Machine Learning) data connections for secure database access and returns query results in a formatted, readable table format.

## Parameters

### User Parameters

These parameters are required for tool configuration and database connectivity:

- **workload_user** (str, required): Username for database authentication
- **workload_pass** (str, required): Password for database authentication  
- **hive_cai_data_connection_name** (str, required): Name of the CML data connection to use
- **default_database** (str, required): Default database schema to use for queries

### Tool Parameters

- **sql_query** (str, required): The SQL query to execute on the database

## Usage

The tool requires both user parameters for configuration and tool parameters for the specific query:

```json
{
  "sql_query": "SELECT * FROM customers WHERE region = 'North America' LIMIT 10"
}
```

User parameters must be configured separately when setting up the tool instance.

## Examples

### Basic SELECT Query
```json
{
  "sql_query": "SELECT customer_id, customer_name, total_orders FROM customers ORDER BY total_orders DESC LIMIT 5"
}
```

### Aggregation Query
```json
{
  "sql_query": "SELECT region, COUNT(*) as customer_count, AVG(total_spent) as avg_spending FROM customers GROUP BY region"
}
```

### Join Query
```json
{
  "sql_query": "SELECT c.customer_name, o.order_date, o.total_amount FROM customers c JOIN orders o ON c.customer_id = o.customer_id WHERE o.order_date >= '2024-01-01'"
}
```

The tool will return formatted table results like:

```
customer_name    order_date    total_amount
John Smith       2024-01-15    1250.00
Sarah Johnson    2024-01-16    890.50
Mike Davis       2024-01-17    2100.75
```

## Output Format

The tool returns query results as a formatted string representation of a pandas DataFrame, which includes:

- Column headers aligned properly
- Row data formatted for readability
- No row indices (index=False)
- Proper spacing and alignment for easy reading

## Dependencies

- **cml.data_v1**: CML data connection management
- **pandas**: Data processing and formatting
- **pydantic**: Parameter validation
- **Standard library modules**: json, argparse, os, textwrap

## Implementation Details

- Uses CML data connections for secure database access
- Automatically sets the database context using the `USE` statement
- Removes trailing semicolons from queries to prevent syntax issues
- Extracts column names from cursor description for proper DataFrame creation
- Returns structured output using the `OUTPUT_KEY` mechanism
- Properly closes database connections in finally blocks

## Error Handling

The tool provides comprehensive error handling for:

- **SQL Syntax Errors**: Returns detailed error messages for malformed queries
- **Connection Issues**: Handles database connectivity problems
- **Authentication Failures**: Manages credential-related authentication errors
- **Permission Errors**: Handles insufficient database permissions
- **Query Execution Errors**: Captures and reports runtime query failures

All errors are returned as descriptive text messages with the format: `"SQL Execution failed. Error details: {error}"`

## Features

- **Secure Authentication**: Uses user-defined workload credentials for database access
- **Connection Management**: Automatic connection handling with proper cleanup
- **Database Context**: Sets default database context for simplified queries
- **Flexible Queries**: Supports all standard SQL operations (SELECT, INSERT, UPDATE, DELETE)
- **Formatted Output**: Returns well-formatted, readable query results
- **Error Resilience**: Comprehensive error handling and reporting

## Security Considerations

- Database credentials are passed securely through user parameters
- Uses established CML data connection patterns

## Limitations

- Requires CML environment and proper data connection setup
- Large result sets may consume significant memory and processing time
- Results are returned as text format, not structured data objects
- Query timeout handling depends on underlying database configuration
- No built-in query validation or SQL injection protection
