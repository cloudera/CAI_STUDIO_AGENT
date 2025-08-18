'use client';

import React, { useEffect } from 'react';
import { WorkflowData } from '../../lib/types';
import { Layout, Typography } from 'antd/lib';
const { Text, Title } = Typography;
import WorkflowApp from './WorkflowApp';
import { useAppDispatch } from '../../lib/hooks/hooks';
import { updatedEditorWorkflowFromExisting } from '../../workflows/editorSlice';

interface WorkflowAppDeployedProps {
  workflowData: WorkflowData;
}

interface WorkflowAppDeployedHeaderProps {
  workflowData: WorkflowData;
}

/**
 * Header for the deployed workflow app. This header is displayed at the top
 * of the workflow app and contains the workflow name and a "built with"
 * message. This is only displayed in deployed mode.
 */
const WorkflowAppDeployedHeader: React.FC<WorkflowAppDeployedHeaderProps> = ({ workflowData }) => {
  return (
    <Layout className="bg-transparent p-0 mb-[12px] flex flex-row items-center justify-between flex-none">
      <Title level={1} ellipsis className="flex-grow">
        {workflowData.workflow.name}
      </Title>
      <Layout className="bg-[#132329] opacity-70 rounded flex flex-col justify-center items-center flex-none p-[12px]">
        <Text className="font-sans text-white text-[12px] font-extralight">built with</Text>
        <Text className="font-sans text-white text-[16px] font-extralight">
          Cloudera <b>Agent Studio</b>
        </Text>
      </Layout>
    </Layout>
  );
};

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
      <WorkflowAppDeployedHeader workflowData={workflowData} />
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
