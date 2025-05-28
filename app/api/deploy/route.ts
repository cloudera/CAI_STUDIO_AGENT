import { NextRequest, NextResponse } from 'next/server';
import { AgentStudioClient } from '@/studio/proto/agent_studio';
import { credentials } from '@grpc/grpc-js';

export async function POST(request: NextRequest) {
  const addr = `127.0.0.1:${process.env.AGENT_STUDIO_SERVICE_PORT}`;
  const client = new AgentStudioClient(addr, credentials.createInsecure());

  try {
    const requestBody = await request.json(); // For POST, parse JSON body

    const deploymentRequest = {
      workflow_id: '',
      env_variable_overrides: {},
      tool_user_parameters: {},
      mcp_instance_env_vars: {},
      bypass_authentication: false,
      generation_config: '',
      deployment_payload: JSON.stringify(requestBody),
    };

    const grpcResponse = await new Promise((resolve, reject) => {
      client.deployWorkflow(deploymentRequest, (err: Error | null, response: any) => {
        if (err) {
          return reject(err);
        }
        resolve(response);
      });
    });

    return NextResponse.json(grpcResponse);
  } catch (error: any) {
    console.error('Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
