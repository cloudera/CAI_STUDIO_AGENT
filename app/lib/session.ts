import type { WorkflowData } from '@/app/lib/types';
import type { CreateSessionRequest } from '@/studio/proto/agent_studio';

export async function createSessionForWorkflow(options: {
  renderMode: 'studio' | 'workflow';
  workflow?: { workflow_id?: string; id?: string } | null;
  workflowData?: WorkflowData | null;
}): Promise<{ session_id: string; session_directory: string }> {
  const { renderMode, workflow, workflowData } = options;

  if (renderMode === 'studio') {
    const workflowId = (workflow as any)?.workflow_id || (workflow as any)?.id;
    if (!workflowId) {
      throw new Error('Missing workflow id for studio mode create session');
    }
    const resp = await fetch('/api/grpc/createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_id: workflowId } as CreateSessionRequest),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create session');
    }
    const data = (await resp.json()) as any;
    const session_id: string = data.session_id || data.response?.session_id;
    const session_directory: string = data.session_directory || data.response?.session_directory;
    if (!session_id || !session_directory) {
      throw new Error('Invalid createSession response');
    }
    return { session_id, session_directory };
  } else {
    const modelUrl = workflowData?.workflowModelUrl;
    if (!modelUrl) {
      throw new Error('Missing workflow model URL for workflow mode create-session');
    }
    const resp = await fetch(`${modelUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          action_type: 'create-session',
        },
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create session');
    }
    const data = (await resp.json()) as any;
    const session_id: string = data.response?.session_id;
    const session_directory: string = data.response?.session_directory;
    if (!session_id || !session_directory) {
      throw new Error('Invalid create-session response');
    }
    return { session_id, session_directory };
  }
}
