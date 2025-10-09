import { NextRequest, NextResponse } from 'next/server';
import { DeployedWorkflow } from '@/studio/proto/agent_studio';
import fetch from 'node-fetch';
import { fetchModelUrl, createAgent } from '@/app/lib/ops';
import { deployedWorkflowResponseConversion } from '@/app/utils/conversions';

// Extract information about the rendermode and the
// workflow if a workflow app is initialized. This
// is determined by env vars that are passed in at
// application start.
export async function GET(_request: NextRequest) {
  const agent = createAgent();

  if (process.env.AGENT_STUDIO_RENDER_MODE === 'workflow') {
    const deployedModelId = process.env.AGENT_STUDIO_DEPLOYED_MODEL_ID;
    const modelUrl = await fetchModelUrl(deployedModelId as string);

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
    const maxWaitTime = 60000; // 60 seconds
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
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

        // If status is not ok, abort the polling
        if (!getMcpToolDefinitionsResponse.ok) {
          console.error(
            `Received error status ${getMcpToolDefinitionsResponse.status} from get-mcp-tool-definitions: aborting polling.`,
          );
          break;
        }

        const getMcpToolDefinitionsResponseData =
          (await getMcpToolDefinitionsResponse.json()) as any;

        if (getMcpToolDefinitionsResponseData.response?.ready) {
          mcpToolDefinitions = getMcpToolDefinitionsResponseData.response?.mcp_tool_definitions;
          break;
        }
      } catch (err) {
        console.error('Error getching MCP tool definitions — aborting polling:', err);
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Convert configuration to WorkflowInfo using the utility function
    const workflowInfo = deployedWorkflowResponseConversion(configuration);

    // Apply MCP tool definitions to the converted MCP instances
    if (workflowInfo.mcpInstances && mcpToolDefinitions) {
      workflowInfo.mcpInstances.forEach((mcpInstance) => {
        if (mcpToolDefinitions[mcpInstance.id]) {
          mcpInstance.tools = JSON.stringify(mcpToolDefinitions[mcpInstance.id]);
        }
      });
    }

    const deployedWorkflow: DeployedWorkflow = {
      deployed_workflow_id: configuration.workflow.deployment_id,
      workflow_id: configuration.workflow.id,
      workflow_name: configuration.workflow.name,
      deployed_workflow_name: configuration.workflow.name,
      cml_deployed_model_id: deployedModelId as string,
      application_url: '', // These fields aren't in the config response
      application_status: '',
      application_deep_link: '',
      model_deep_link: '',
      created_at: configuration.workflow.created_at || '',
      updated_at: configuration.workflow.updated_at || '',
      stale: false,
    };

    return NextResponse.json({
      renderMode: process.env.AGENT_STUDIO_RENDER_MODE,
      deployedWorkflowId: process.env.AGENT_STUDIO_DEPLOYED_WORKFLOW_ID,
      deployedWorkflow: deployedWorkflow,
      workflowModelUrl: await fetchModelUrl(deployedWorkflow.cml_deployed_model_id),
      workflow: workflowInfo.workflow,
      agents: workflowInfo.agents,
      tasks: workflowInfo.tasks,
      toolInstances: workflowInfo.toolInstances,
      mcpInstances: workflowInfo.mcpInstances,
    });
  } else {
    return NextResponse.json({
      renderMode: process.env.AGENT_STUDIO_RENDER_MODE,
    });
  }
}
