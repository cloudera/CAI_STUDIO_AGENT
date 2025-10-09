import { useListAgentsQuery } from '../../agents/agentApi';
import { useAppSelector } from '../../lib/hooks/hooks';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { selectEditorWorkflow } from '../../workflows/editorSlice';
import WorkflowEditorConfigureInputs from './WorkflowEditorConfigureInputs';
import { Divider, Layout } from 'antd';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';

interface WorkflowEditorConfigureViewProps {
  workflowId: string;
}

const WorkflowEditorConfigureView = ({ workflowId }: WorkflowEditorConfigureViewProps) => {
  const workflowState = useAppSelector(selectEditorWorkflow);
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: mcpInstances } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });

  return (
    <>
      <Layout className="flex-1 flex flex-row bg-white rounded">
        <WorkflowEditorConfigureInputs workflowId={workflowId} />
        <Divider type="vertical" className="h-full" />
        <WorkflowDiagramView
          workflowState={workflowState}
          toolInstances={toolInstances}
          mcpInstances={mcpInstances}
          tasks={tasks}
          agents={agents}
          displayDiagnostics={false}
        />
      </Layout>
    </>
  );
};

export default WorkflowEditorConfigureView;
