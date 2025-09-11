'use client';

import React, { useEffect, useState } from 'react';
import { WorkflowData } from '../../lib/types';
import { Layout, Typography, Button } from 'antd/lib';
const { Text, Title } = Typography;
import { ApiOutlined } from '@ant-design/icons';
import WorkflowApp from './WorkflowApp';
import WorkflowAppApiDrawer from './WorkflowAppApiDrawer';
import { useAppDispatch } from '../../lib/hooks/hooks';
import { updatedEditorWorkflowFromExisting } from '../../workflows/editorSlice';

interface WorkflowAppDeployedProps {
  workflowData: WorkflowData;
}

interface WorkflowAppDeployedHeaderProps {
  workflowData: WorkflowData;
  onOpenApiDrawer: () => void;
}

/**
 * Header for the deployed workflow app. This header is displayed at the top
 * of the workflow app and contains the workflow name and a "built with"
 * message. This is only displayed in deployed mode.
 */
const WorkflowAppDeployedHeader: React.FC<WorkflowAppDeployedHeaderProps> = ({
  workflowData,
  onOpenApiDrawer,
}) => {
  return (
    <Layout className="bg-transparent p-0 mb-[12px] flex flex-row items-center justify-between flex-none">
      <Title level={1} ellipsis className="flex-grow">
        {workflowData.workflow.name}
      </Title>
      <div className="flex items-center gap-3">
        <Button
          type="primary"
          icon={<ApiOutlined />}
          onClick={onOpenApiDrawer}
          className="bg-blue-600 hover:bg-blue-700 border-blue-600 hover:border-blue-700"
        >
          API
        </Button>
        <Layout className="bg-[#132329] opacity-70 rounded flex flex-col justify-center items-center flex-none p-[12px]">
          <Text className="font-sans text-white text-[12px] font-extralight">built with</Text>
          <Text className="font-sans text-white text-[16px] font-extralight">
            Cloudera <b>Agent Studio</b>
          </Text>
        </Layout>
      </div>
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
  const [isApiDrawerOpen, setIsApiDrawerOpen] = useState(false);

  // Initialize Redux workflow state for deployed workflows
  useEffect(() => {
    if (workflowData.workflow) {
      dispatch(updatedEditorWorkflowFromExisting(workflowData.workflow));
    }
  }, [workflowData.workflow, dispatch]);

  const handleOpenApiDrawer = () => {
    setIsApiDrawerOpen(true);
  };

  const handleCloseApiDrawer = () => {
    setIsApiDrawerOpen(false);
  };

  return (
    <>
      <WorkflowAppDeployedHeader
        workflowData={workflowData}
        onOpenApiDrawer={handleOpenApiDrawer}
      />
      <WorkflowApp
        workflow={workflowData.workflow}
        refetchWorkflow={() => {}}
        tasks={workflowData.tasks}
        toolInstances={workflowData.toolInstances}
        mcpInstances={workflowData.mcpInstances}
        agents={workflowData.agents}
        renderMode="workflow"
      />
      <WorkflowAppApiDrawer
        open={isApiDrawerOpen}
        onClose={handleCloseApiDrawer}
        workflowName={workflowData.workflow.name}
        workflowTasks={workflowData.tasks}
      />
    </>
  );
};

export default WorkflowAppDeployed;
