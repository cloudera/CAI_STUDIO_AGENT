import WorkflowEditorTaskInputs from './WorkflowEditorTaskInputs';
import { Divider, Layout } from 'antd';
import { useAppSelector, useAppDispatch } from '../../lib/hooks/hooks';
import {
  selectEditorWorkflow,
  updatedEditorWorkflowFromExisting,
} from '../../workflows/editorSlice';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListAgentsQuery } from '../../agents/agentApi';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';
import { useGetWorkflowMutation } from '../../workflows/workflowsApi';
import { useEffect } from 'react';

interface WorkflowEditorTaskViewProps {
  workflowId: string;
}

const WorkflowEditorTaskView = ({ workflowId }: WorkflowEditorTaskViewProps) => {
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
      <Layout className="flex-1 flex-row bg-white rounded-md">
        <WorkflowEditorTaskInputs workflowId={workflowId}></WorkflowEditorTaskInputs>
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

export default WorkflowEditorTaskView;
