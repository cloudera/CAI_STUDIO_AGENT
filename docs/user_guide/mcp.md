# Model Context Protocol (MCP) Integration Guide

This guide explains how to integrate and use Model Context Protocol (MCP) servers in Cloudera AI Agent Studio. MCP enables AI agents to securely connect to external data sources and tools, extending the capabilities of your workflows.

## Overview

The Model Context Protocol (MCP) is an open standard that enables AI applications to provide LLMs with context from external data sources and tools. In Agent Studio, MCP servers function as families of tools for particular services (like Slack, Jira, databases, web search, etc.), allowing your agents to interact with external systems in a controlled and secure manner.

## Key Concepts

### MCP Servers as Tool Families
Think of MCP servers as collections of related tools that provide access to specific services or data sources:

- **DuckDuckGo MCP Server**: Provides web search and content fetching tools
- **Slack MCP Server**: Offers tools for reading messages, posting updates, managing channels
- **Jira MCP Server**: Includes tools for creating tickets, querying issues, updating status
- **Database MCP Server**: Provides tools for querying, inserting, and updating database records

### Tool Discovery
Agent Studio automatically reflects on registered MCP servers to discover available tools. While discovery might occasionally fail, you can still use the MCP server in workflows even if some tools aren't automatically detected.

## Supported MCP Server Types

Agent Studio currently supports MCP servers that can be executed through:

- **Python-based servers**: Using [`uvx`](https://docs.astral.sh/uv/guides/tools/) command
- **Node.js-based servers**: Using [`npx`](https://docs.npmjs.com/cli/v8/commands/npx) command

These tools allow running MCP servers without requiring global installation, providing better isolation and dependency management.

### Transport Limitations

**Current Support**: Agent Studio currently supports only **local MCP servers** that use the Standard Input/Output (stdio) transport mechanism. This means MCP servers run as local processes and communicate through stdin/stdout streams.

**Future Support**: Support for **Streamable HTTP-based MCP servers** may be added in future releases. This would enable connecting to remote MCP servers over HTTP, allowing for more distributed architectures and cloud-hosted MCP services.

For more information about MCP transport mechanisms, see the [MCP Transport Documentation](https://modelcontextprotocol.io/docs/concepts/transports).

## Registering MCP Servers

### Step 1: Access the Tools Catalog

Navigate to the **Tools Catalog** in Agent Studio and click on the **MCP Servers** tab.

![Tools Catalog MCP Servers](./mcp_example_assets/01-tools-catalog-mcp-servers.png)

### Step 2: Register a New MCP Server

Click the **"Register"** button to open the MCP server registration dialog.

![Register MCP Server Dialog](./mcp_example_assets/02-register-mcp-server-dialog.png)

### Step 3: Configure MCP Server Settings

Agent Studio uses the same configuration format as [Claude Desktop for MCP server registration](https://modelcontextprotocol.io/quickstart/user#mac-os-linux). Provide the following information:

#### MCP Server Configuration Format

```json
{
    "mcpServers": {
        "<ServerName>": {
            "command": "<runtime>",
            "args": ["<package-name>"],
            "env": {
                "VARIABLE_NAME": "value"
            }
        }
    }
}
```

#### Examples

**Python-based MCP Server (using uvx):**
```json
{
    "mcpServers": {
        "DuckDuckGo": {
            "command": "uvx",
            "args": ["duckduckgo-mcp-server"]
        }
    }
}
```

**Node.js-based MCP Server (using npx):**
```json
{
    "mcpServers": {
        "Puppeteer": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
        }
    }
}
```

**MCP Server with Environment Variables:**
```json
{
  "mcpServers": {
    "awslabs.amazon-sns-sqs-mcp-server": {
      "command": "uvx",
      "args": ["awslabs.amazon-sns-sqs-mcp-server@latest"],
      "env": {
        "AWS_PROFILE": "your-aws-profile",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

### Step 4: Handle Environment Variables

**Important Security Note**: Environment variable values are **not stored** in the Agent Studio backend for security purposes. When configuring the MCP server:

1. **During Registration**: Use dummy or placeholder values for sensitive environment variables
2. **During Workflow Configuration**: You'll be prompted to provide actual values when adding the MCP server to a workflow

Example with placeholders:
```json
{
    "mcpServers": {
        "DatabaseMCP": {
            "command": "uvx",
            "args": ["database-mcp-server"],
            "env": {
                "DATABASE_URL": "postgresql://user:password@host:port/database",
                "API_KEY": "your-api-key-here"
            }
        }
    }
}
```

### Step 5: Server Validation and Tool Discovery

After registration, Agent Studio will:

1. **Validate** the MCP server configuration
2. **Discover** available tools by reflecting on the server
3. **Catalog** the tools for use in workflows

![DuckDuckGo Server Registered](./mcp_example_assets/03-duckduckgo-server-registered.png)

## Exploring MCP Server Tools

### Viewing Available Tools

Click on a registered MCP server to view its available tools and capabilities.

![DuckDuckGo Server Details](./mcp_example_assets/04-duckduckgo-server-details.png)

### Tool Information

For each discovered tool, you can view:

- **Tool Name**: The identifier used to call the tool
- **Description**: What the tool does
- **Input Schema**: Required and optional parameters

## Using MCP Servers in Workflows

### Adding MCP Servers to Agents

When creating or editing agents in a workflow, you can add MCP servers to extend their capabilities.

![Add MCP Server to Agent](./mcp_example_assets/06-add-mcp-server-to-agent.png)

#### Steps:

1. **Select MCP Server**: Choose from your registered servers
2. **Choose Tools**: Select which tools the agent should have access to
3. **Configure Environment**: Provide actual values for environment variables (if required)
4. **Apply Changes**: Save the configuration

### Agent Configuration with MCP Tools

Once added, agents will have access to the selected MCP tools.

![Agent with MCP Server](./mcp_example_assets/07-agent-with-mcp-server.png)

The agent can now:
- Use MCP tools in their decision-making process
- Access external data sources through the tools
- Perform actions in external systems

### Workflow Integration

MCP tools integrate seamlessly into your workflow structure.

![Workflow with MCP Tools](./mcp_example_assets/08-workflow-with-mcp-tools.png)

## Additional Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/introduction)
- [Agent Studio Workflows User Guide](./workflows.md)
- [DuckDuckGo MCP Example Tutorial](./mcp_example.md) 