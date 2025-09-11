import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { base64Encode, createAgent, fetchModelUrl } from '@/app/lib/ops';

/**
 * Kickoff a workflow. Currently only supports the kickoff of a deployed
 * workflow, but in the future we can extend this API to also support
 * kickoff of test workflows within the studio (i.e., have support for
 * both the deployed workflow mode and the test workflow mode).
 */
export async function POST(request: NextRequest) {
  const agent = createAgent();
  const deployedModelId = process.env.AGENT_STUDIO_DEPLOYED_MODEL_ID;
  const modelUrl = await fetchModelUrl(deployedModelId as string);
  const { inputs } = await request.json();
  const kickoffResponse = await fetch(`${modelUrl}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request: {
        action_type: 'kickoff',
        kickoff_inputs: base64Encode(inputs),
      },
    }),
    agent,
  });
  const kickoffResponseData = (await kickoffResponse.json()) as any;
  const traceId = kickoffResponseData.response.trace_id;
  return NextResponse.json({
    trace_id: traceId,
  });
}
