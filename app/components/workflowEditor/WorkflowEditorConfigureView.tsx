import { useListAgentsQuery } from '../../agents/agentApi';
import { useAppSelector } from '../../lib/hooks/hooks';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { selectEditorWorkflow } from '../../workflows/editorSlice';
import WorkflowEditorConfigureInputs from './WorkflowEditorConfigureInputs';
import { Divider, Layout } from 'antd';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';

interface WorkflowEditorConfigureViewProps {
  workflowId: string;
}

const WorkflowEditorConfigureView: React.FC<WorkflowEditorConfigureViewProps> = ({
  workflowId,
}) => {
  const workflowState = useAppSelector(selectEditorWorkflow);
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });

  return (
    <>
      <Layout
        style={{
          flex: 1,
          flexDirection: 'row',
          backgroundColor: 'white',
          borderRadius: 4,
        }}
      >
        <WorkflowEditorConfigureInputs workflowId={workflowId} />
        <Divider type="vertical" style={{ height: '100%' }} />
        <WorkflowDiagramView
          workflowState={workflowState}
          toolInstances={toolInstances}
          tasks={tasks}
          agents={agents}
          displayDiagnostics={false}
        />
      </Layout>
    </>
  );
};

export default WorkflowEditorConfigureView;
