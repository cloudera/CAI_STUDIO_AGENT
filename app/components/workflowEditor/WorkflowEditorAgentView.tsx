import { useEffect } from 'react';
import { useListAgentsQuery } from '../../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { selectEditorWorkflow } from '../../workflows/editorSlice';
import WorkflowEditorAgentInputs from './WorkflowEditorAgentInputs';
import { Divider, Layout } from 'antd';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';
import { useGetWorkflowMutation } from '../../workflows/workflowsApi';
import { updatedEditorWorkflowFromExisting } from '../../workflows/editorSlice';

interface WorkflowEditorAgentViewProps {
  workflowId: string;
}

const WorkflowEditorAgentView = ({ workflowId }: WorkflowEditorAgentViewProps) => {
  const dispatch = useAppDispatch();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const [getWorkflow] = useGetWorkflowMutation();
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: mcpInstances } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });

  useEffect(() => {
    if (!workflowState.workflowId || workflowState.workflowId !== workflowId) {
      getWorkflow({ workflow_id: workflowId })
        .unwrap()
        .then((workflow: any) => {
          dispatch(updatedEditorWorkflowFromExisting(workflow));
        })
        .catch((error: any) => {
          console.error('Failed to sync workflow state:', error);
        });
    }
  }, [workflowId, workflowState.workflowId, dispatch, getWorkflow]);

  if (!workflowState.workflowId) {
    return null;
  }

  return (
    <>
      <Layout className="flex-1 flex flex-row bg-white rounded">
        <WorkflowEditorAgentInputs workflowId={workflowId} />
        <Divider type="vertical" className="h-full flex-grow-0 flex-shrink-0" />
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

export default WorkflowEditorAgentView;
