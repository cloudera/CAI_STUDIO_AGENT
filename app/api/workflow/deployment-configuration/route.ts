import { NextRequest, NextResponse } from 'next/server';
import { createAgent, fetchModelUrl } from '@/app/lib/ops';
import fetch from 'node-fetch';

function queryToJson(query: URLSearchParams): Record<string, string> {
  const json: Record<string, string> = {};
  query.forEach((value, key) => {
    json[key] = value;
  });
  return json;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const agent = createAgent();
  const body = queryToJson(request.nextUrl.searchParams);
  const workbenchModelId: string | undefined = body.workbenchModelId;
  if (!workbenchModelId) {
    return NextResponse.json(
      { error: 'workbenchModelId query parameter is required' },
      { status: 400 },
    );
  }

  const modelUrl = await fetchModelUrl(workbenchModelId as string);

  const getConfigurationResponse = await fetch(`${modelUrl}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request: {
        action_type: 'get-configuration',
      },
    }),
    agent,
  });
  const getConfigurationResponseData = (await getConfigurationResponse.json()) as any;
  const configuration = getConfigurationResponseData.response?.configuration;

  let mcpToolDefinitions: any = null;
  try {
    const getMcpToolDefinitionsResponse = await fetch(`${modelUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request: {
          action_type: 'get-mcp-tool-definitions',
        },
      }),
      agent,
    });

    if (getMcpToolDefinitionsResponse.ok) {
      const getMcpToolDefinitionsResponseData = (await getMcpToolDefinitionsResponse.json()) as any;

      if (getMcpToolDefinitionsResponseData.response?.ready) {
        mcpToolDefinitions = getMcpToolDefinitionsResponseData.response?.mcp_tool_definitions;
      }
    } else {
      console.warn(
        `Failed to fetch MCP tool definitions with status ${getMcpToolDefinitionsResponse.status}`,
      );
    }
  } catch (err) {
    console.warn('Error fetching MCP tool definitions:', err);
  }

  return NextResponse.json({
    ...configuration,
    mcpToolDefinitions,
  });
}
