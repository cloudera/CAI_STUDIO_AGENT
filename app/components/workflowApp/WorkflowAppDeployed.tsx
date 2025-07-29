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
    <Layout
      style={{
        background: 'transparent',
        padding: 0,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexGrow: 0,
        flexShrink: 0,
      }}
    >
      <Title level={1} ellipsis style={{ flexGrow: 1 }}>
        {workflowData.workflow.name}
      </Title>
      <Layout
        style={{
          backgroundColor: '#132329',
          opacity: 0.7,
          borderRadius: 4,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          flexGrow: 0,
          flexShrink: 0,
          padding: 12,
        }}
      >
        <Text className="font-sans" style={{ fontSize: 12, fontWeight: 200, color: 'white' }}>
          built with
        </Text>
        <Text className="font-sans" style={{ fontSize: 16, fontWeight: 200, color: 'white' }}>
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
