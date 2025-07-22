'use client';

import React, { useEffect } from 'react';
import { WorkflowData } from '../../lib/types';
import { Typography } from 'antd/lib';
const { Text, Title } = Typography;
import WorkflowApp from './WorkflowApp';
import { useAppDispatch } from '../../lib/hooks/hooks';
import { updatedEditorWorkflowFromExisting } from '../../workflows/editorSlice';

interface WorkflowAppDeployedProps {
  workflowData: WorkflowData;
}

/**
 * Light wrapper around the workflow app for "deployed" mode. In this
 * mode, the workflow App component does not make calls to the gRPC service
 * and rather depends on data available in the WorkflowData call which
 * is returned from the deployed workflow model directly.
 */
const WorkflowAppDeployed: React.FC<WorkflowAppDeployedProps> = ({ workflowData }) => {
  const dispatch = useAppDispatch();

  // Initialize Redux workflow state for deployed workflows
  useEffect(() => {
    if (workflowData.workflow) {
      dispatch(updatedEditorWorkflowFromExisting(workflowData.workflow));
    }
  }, [workflowData.workflow, dispatch]);

  return (
    <>
      <WorkflowApp
        workflow={workflowData.workflow}
        refetchWorkflow={() => {}}
        tasks={workflowData.tasks}
        toolInstances={workflowData.toolInstances}
        mcpInstances={workflowData.mcpInstances}
        agents={workflowData.agents}
        renderMode="workflow"
      />
    </>
  );
};

export default WorkflowAppDeployed;
