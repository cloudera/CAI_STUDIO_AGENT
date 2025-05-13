'use client';

import React from 'react';
import WorkflowApp from './WorkflowApp';
import { useGetWorkflowByIdQuery } from '@/app/workflows/workflowsApi';
import { useListToolInstancesQuery } from '@/app/tools/toolInstancesApi';
import { useListAgentsQuery } from '@/app/agents/agentApi';
import { useListTasksQuery } from '@/app/tasks/tasksApi';

interface WorkflowAppTestProps {
  workflowId: string;
}

/**
 * Light wrapper around our WorkflowApp to be rendered in test mode.
 * this means workflow app component is populated via gRPC API calls
 * to the AS service.
 */
const WorkflowAppTest: React.FC<WorkflowAppTestProps> = ({ workflowId }) => {
  const { data: workflow, refetch: refetchWorkflow } = useGetWorkflowByIdQuery(workflowId);
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });

  if (!workflow) {
    return (<></>)
  }

  return (
    <>
      <WorkflowApp
        workflow={workflow}
        refetchWorkflow={refetchWorkflow}
        tasks={tasks || []}
        toolInstances={toolInstances || []}
        agents={agents || []}
        renderMode='studio'
      />
    </>
  );
};

export default WorkflowAppTest;
