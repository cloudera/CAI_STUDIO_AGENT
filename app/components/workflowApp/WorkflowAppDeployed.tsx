'use client';

import React from 'react';
import { WorkflowData } from '../../lib/types';
import { Typography } from 'antd/lib';
const { Text, Title } = Typography;
import WorkflowApp from './WorkflowApp';

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
  return (
    <>
      <WorkflowApp
        workflow={workflowData.workflow}
        refetchWorkflow={() => {}}
        tasks={workflowData.tasks}
        toolInstances={workflowData.toolInstances}
        agents={workflowData.agents}
        renderMode="workflow"
      />
    </>
  );
};

export default WorkflowAppDeployed;
