'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Layout, Spin, Alert, Divider } from 'antd';
import { useGetWorkflowMutation } from '@/app/workflows/workflowsApi';
import {
  useListDeployedWorkflowsQuery,
  useUndeployWorkflowMutation,
} from '@/app/workflows/deployedWorkflowsApi';
import WorkflowDetails from './WorkflowDetails';
import { useAppDispatch } from '../../lib/hooks/hooks';
import { updatedEditorWorkflowFromExisting } from '../../workflows/editorSlice';
import { DeployedWorkflow } from '@/studio/proto/agent_studio';
import { useGlobalNotification } from '../Notifications';
import ErrorBoundary from '../ErrorBoundary';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListAgentsQuery } from '../../agents/agentApi';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';

interface WorkflowOverviewProps {
  workflowId: string;
}

const WorkflowOverview: React.FC<WorkflowOverviewProps> = ({ workflowId }) => {
  const [getWorkflow] = useGetWorkflowMutation();
  const [workflowDetails, setWorkflowDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const { data: deployedWorkflows = [] } = useListDeployedWorkflowsQuery({});
  const [undeployWorkflow] = useUndeployWorkflowMutation();
  const notificationsApi = useGlobalNotification();
  const { data: toolInstances } = useListToolInstancesQuery({workflow_id: workflowId});
  const { data: tasks } = useListTasksQuery({workflow_id: workflowId});
  const { data: agents } = useListAgentsQuery({workflow_id: workflowId});

  useEffect(() => {
    const fetchWorkflow = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getWorkflow({ workflow_id: workflowId }).unwrap();
        setWorkflowDetails(response);
        dispatch(updatedEditorWorkflowFromExisting(response));
      } catch (err: any) {
        setError(err.message || 'Failed to fetch workflow details.');
      } finally {
        setLoading(false);
      }
    };

    workflowId && fetchWorkflow();
  }, [workflowId, getWorkflow, dispatch]);

  const handleDeleteDeployedWorkflow = async (deployedWorkflow: DeployedWorkflow) => {
    try {
      await undeployWorkflow({
        deployed_workflow_id: deployedWorkflow.deployed_workflow_id,
      }).unwrap();

      notificationsApi.success({
        message: 'Deployment Deleted',
        description: `Successfully deleted deployment "${deployedWorkflow.deployed_workflow_name}"`,
        placement: 'topRight',
      });
    } catch (error) {
      notificationsApi.error({
        message: 'Error',
        description: 'Failed to delete deployment',
        placement: 'topRight',
      });
    }
  };

  if (loading) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Suspense fallback={<Spin size="large" />}>
          <Layout
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
            }}
          >
            <Spin size="large" />
          </Layout>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Layout
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <Alert message="Error" description={error} type="error" showIcon />
        </Layout>
      </ErrorBoundary>
    );
  }

  if (!workflowDetails) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Layout
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          <Alert
            message="No Data"
            description="No workflow details available."
            type="info"
            showIcon
          />
        </Layout>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
      <Suspense fallback={<Spin size="large" />}>
        <Layout
          style={{
            flex: 1,
            flexDirection: 'row',
            backgroundColor: 'white',
            borderRadius: 4,
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          {/* Left Side: Workflow Details */}
          <Layout.Content
            style={{
              background: '#fff',
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: '1 1 40%',
            }}
          >
            <WorkflowDetails
              workflowId={workflowId}
              workflow={workflowDetails}
              deployedWorkflows={deployedWorkflows}
              onDeleteDeployedWorkflow={handleDeleteDeployedWorkflow}
            />
          </Layout.Content>

          <Divider type="vertical" style={{ height: '100%', flexGrow: 0, flexShrink: 0 }} />

          {/* Right Side: Workflow Diagram */}
          <Layout.Content
            style={{
              background: 'transparent',
              flex: '1 1 60%',
              position: 'relative',
              minHeight: 0, // Important for ReactFlow
            }}
          >
            <WorkflowDiagramView
              workflowState={{
                name: workflowDetails.name,
                workflowId: '', // not used for diagram
                isConversational: workflowDetails.is_conversational,
                workflowMetadata: {
                  agentIds: workflowDetails.crew_ai_workflow_metadata?.agent_id,
                  taskIds: workflowDetails.crew_ai_workflow_metadata?.task_id,
                  process: workflowDetails.crew_ai_workflow_metadata?.process,
                  managerAgentId: workflowDetails.crew_ai_workflow_metadata?.manager_agent_id,
                },
              }}
              toolInstances={toolInstances}
              agents={agents}
              tasks={tasks}
              displayDiagnostics={false}
            />
          </Layout.Content>
        </Layout>
      </Suspense>
    </ErrorBoundary>
  );
};

export default WorkflowOverview;
