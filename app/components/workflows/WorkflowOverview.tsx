'use client';

import React, { useEffect, useState, Suspense } from 'react';
import {
  Layout,
  Spin,
  Alert,
  Divider,
  Avatar,
  Button,
  Dropdown,
  MenuProps,
  Typography,
  Tag,
  List,
  Collapse,
} from 'antd';
import { useGetWorkflowMutation } from '@/app/workflows/workflowsApi';
import {
  useListDeployedWorkflowsQuery,
  useUndeployWorkflowMutation,
  useSuspendDeployedWorkflowMutation,
  useResumeDeployedWorkflowMutation,
  useGetRawDeploymentConfigurationQuery,
} from '@/app/workflows/deployedWorkflowsApi';
import WorkflowSubOverview from './WorkflowSubOverview';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  updatedEditorWorkflowFromExisting,
  selectEditorWorkflow,
} from '../../workflows/editorSlice';
import { DeployedWorkflow, Workflow } from '@/studio/proto/agent_studio';
import { useGlobalNotification } from '../Notifications';
import { getStatusColor, getStatusDisplay } from './WorkflowListItem';
import { deployedWorkflowResponseConversion, WorkflowInfo } from '@/app/utils/conversions';
import { WorkflowState } from '@/app/workflows/editorSlice';
import { renderAlert } from '@/app/lib/alertUtils';
import {
  DeploymentUnitOutlined,
  ExportOutlined,
  AppstoreOutlined,
  ApiOutlined,
  MoreOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CaretRightOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import ErrorBoundary from '../ErrorBoundary';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useListAgentsQuery } from '../../agents/agentApi';
import WorkflowDiagramView from '../workflowApp/WorkflowDiagramView';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';

const { Title, Text } = Typography;

interface DeploymentCardProps {
  deployment: DeployedWorkflow;
  onDelete: (deployment: DeployedWorkflow) => void;
  onSuspend: (deployment: DeployedWorkflow) => void;
  onResume: (deployment: DeployedWorkflow) => void;
  notificationsApi: any;
  isExpanded: boolean;
  onToggle: (deployment: DeployedWorkflow) => void;
  useActualWorkflowData?: boolean;
  workflowInfo?: WorkflowInfo;
}

interface DraftCardProps {
  workflow: Workflow | null;
  workflowInfo: WorkflowInfo;
  isExpanded: boolean;
  onToggle: () => void;
}

const DeploymentCard: React.FC<DeploymentCardProps> = ({
  deployment,
  onDelete,
  onSuspend,
  onResume,
  notificationsApi,
  isExpanded,
  onToggle,
  useActualWorkflowData = false,
  workflowInfo,
}) => {
  const formatTimestamp = (timestamp: string) => {
    const timestampWithZ = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
    const date = new Date(timestampWithZ);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const status = deployment.application_status || '';
  const statusLower = status.toLowerCase();
  const isSuspendedOrFailed = statusLower.includes('fail') || statusLower.includes('suspended');
  const isDeployedOrRunning = statusLower.includes('deployed') || statusLower.includes('run');

  // Get deployment configuration for WorkflowSubOverview
  const {
    data: deploymentConfig,
    refetch: refetchDeploymentConfig,
    error: deploymentConfigError,
  } = useGetRawDeploymentConfigurationQuery(
    {
      deployedWorkflowId: deployment.deployed_workflow_id,
      workbenchModelId: deployment.cml_deployed_model_id || '',
    },
    {
      skip: !deployment.cml_deployed_model_id,
    },
  );

  useEffect(() => {
    if (isExpanded) {
      refetchDeploymentConfig();
    }
  }, [isExpanded, refetchDeploymentConfig]);

  const menuItems: MenuProps['items'] = [
    {
      key: 'open-app',
      label: 'Open Application UI',
      icon: <ExportOutlined />,
      disabled: !statusLower.includes('run'),
      onClick: () => {
        if (deployment.application_url && deployment.application_url.length > 0) {
          window.open(deployment.application_url, '_blank');
        } else {
          notificationsApi.error({
            message: `Can't open application while it is ${getStatusDisplay(status)}`,
            placement: 'topRight',
          });
        }
      },
    },
    {
      key: 'open-workbench-app',
      label: 'Open Cloudera AI Workbench Application',
      icon: <AppstoreOutlined />,
      disabled: !deployment.application_deep_link,
      onClick: () => {
        if (deployment.application_deep_link) {
          window.open(deployment.application_deep_link, '_blank');
        }
      },
    },
    {
      key: 'open-workbench-model',
      label: 'Open Cloudera AI Workbench Model',
      icon: <ApiOutlined />,
      disabled: !deployment.model_deep_link,
      onClick: () => {
        if (deployment.model_deep_link) {
          window.open(deployment.model_deep_link, '_blank');
        }
      },
    },
    { type: 'divider' },
  ];

  // Add suspend/resume option based on status
  if (isSuspendedOrFailed) {
    menuItems.push({
      key: 'resume',
      label: 'Resume Deployment',
      icon: <ReloadOutlined />,
      onClick: () => onResume(deployment),
    });
  } else {
    menuItems.push({
      key: 'suspend',
      label: 'Suspend Deployment',
      icon: <PoweroffOutlined />,
      disabled: !isDeployedOrRunning,
      onClick: () => {
        const modal = window.confirm('Are you sure you want to suspend this deployment?');
        if (modal) {
          onSuspend(deployment);
        }
      },
    });
  }

  menuItems.push({
    key: 'delete',
    label: 'Delete Deployment',
    icon: <DeleteOutlined />,
    danger: true,
    onClick: () => {
      const modal = window.confirm('Are you sure you want to delete this deployment?');
      if (modal) {
        onDelete(deployment);
      }
    },
  });

  const collapseItems = [
    {
      key: deployment.deployed_workflow_id,
      label: (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar
              className="shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-[#1890ff] min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
              size={24}
              icon={<DeploymentUnitOutlined />}
            />
            <div className="flex-1 min-w-0">
              <Text
                className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis block"
                title={deployment.deployed_workflow_name}
              >
                {deployment.deployed_workflow_name}
              </Text>
            </div>
            <Tag
              color={getStatusColor(status)}
              className={`rounded-[12px] flex-none ${statusLower === 'unknown' ? 'text-white' : ''}`}
            >
              {getStatusDisplay(status)}
            </Tag>
            <Text className="text-[12px] text-gray-500 flex-none">
              {deployment.updated_at ? formatTimestamp(deployment.updated_at) : ''}
            </Text>
          </div>
          <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
            <Button
              type="text"
              icon={<MoreOutlined />}
              className="flex-none"
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </div>
      ),
      children:
        useActualWorkflowData && workflowInfo ? (
          <WorkflowSubOverview workflowInfo={workflowInfo} type="workflow" />
        ) : deploymentConfigError || isSuspendedOrFailed ? (
          <div className="p-4">
            {renderAlert(
              'Deployment Details Unavailable',
              'Deployment details would be available once the underlying workbench model is ready',
              'loading',
            )}
          </div>
        ) : deploymentConfig ? (
          <WorkflowSubOverview
            workflowDeploymentResponse={deploymentConfig}
            type="workflowDeployment"
          />
        ) : (
          <div className="flex justify-center items-center p-4">
            <Spin size="small" />
          </div>
        ),
    },
  ];

  return (
    <div
      key={deployment.deployed_workflow_id}
      className="border border-[#f0f0f0] rounded bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] mb-3"
    >
      <Collapse
        items={collapseItems}
        ghost
        activeKey={isExpanded ? deployment.deployed_workflow_id : undefined}
        onChange={() => onToggle(deployment)}
        expandIcon={({ isActive }) => (
          <div className="flex items-center justify-center h-full">
            <CaretRightOutlined rotate={isActive ? 90 : 0} className="text-xs" />
          </div>
        )}
        className="deployment-collapse [&_.ant-collapse-header]:!items-center [&_.ant-collapse-expand-icon]:!flex [&_.ant-collapse-expand-icon]:!items-center [&_.ant-collapse-expand-icon]:!justify-center [&_.ant-collapse-expand-icon]:!h-full [&_.ant-collapse-expand-icon]:!pt-0 [&_.ant-collapse-expand-icon]:!pb-0 [&_.ant-collapse-content-box]:!p-[2px]"
        style={isExpanded ? { backgroundColor: '#dceafc' } : undefined}
      />
    </div>
  );
};

const DraftCard: React.FC<DraftCardProps> = ({ workflow, workflowInfo, isExpanded, onToggle }) => {
  // Handle missing workflow
  if (!workflow) {
    return (
      <div className="border border-[#f0f0f0] rounded bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] mb-3 p-4">
        <Alert message="Workflow not available" type="warning" />
      </div>
    );
  }

  const workflowName = workflow.name || 'Untitled Workflow';

  const collapseItems = [
    {
      key: 'draft-workflow',
      label: (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar
            className="shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-[#1890ff] min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
            size={24}
            icon={<ApartmentOutlined />}
          />
          <div className="flex-1 min-w-0">
            <Text
              className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis block"
              title={workflowName}
            >
              {workflowName}
            </Text>
          </div>
        </div>
      ),
      children: <WorkflowSubOverview workflowInfo={workflowInfo} type="workflow" />,
    },
  ];

  return (
    <div className="border border-[#f0f0f0] rounded bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] mb-3">
      <Collapse
        items={collapseItems}
        ghost
        activeKey={isExpanded ? 'draft-workflow' : undefined}
        onChange={onToggle}
        expandIcon={({ isActive }) => (
          <div className="flex items-center justify-center h-full">
            <CaretRightOutlined rotate={isActive ? 90 : 0} className="text-xs" />
          </div>
        )}
        className="deployment-collapse [&_.ant-collapse-header]:!items-center [&_.ant-collapse-expand-icon]:!flex [&_.ant-collapse-expand-icon]:!items-center [&_.ant-collapse-expand-icon]:!justify-center [&_.ant-collapse-expand-icon]:!h-full [&_.ant-collapse-expand-icon]:!pt-0 [&_.ant-collapse-expand-icon]:!pb-0 [&_.ant-collapse-content-box]:!p-[2px]"
        style={isExpanded ? { backgroundColor: '#dceafc' } : undefined}
      />
    </div>
  );
};

interface WorkflowDiagramViewForDeploymentProps {
  deployment: DeployedWorkflow;
}

const WorkflowDiagramViewForDeployment: React.FC<WorkflowDiagramViewForDeploymentProps> = ({
  deployment,
}) => {
  const { data: deploymentConfig, error: deploymentConfigError } =
    useGetRawDeploymentConfigurationQuery(
      {
        deployedWorkflowId: deployment.deployed_workflow_id,
        workbenchModelId: deployment.cml_deployed_model_id || '',
      },
      {
        skip: !deployment.cml_deployed_model_id,
      },
    );

  const status = deployment.application_status || '';
  const statusLower = status.toLowerCase();
  const isSuspendedOrFailed = statusLower.includes('fail') || statusLower.includes('suspended');

  // Handle error case for suspended or failed deployments BEFORE trying to convert
  if (deploymentConfigError || isSuspendedOrFailed || !deploymentConfig) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        {renderAlert(
          'Deployment Details Unavailable',
          'Deployment details would be available once the underlying workbench model is ready',
          'loading',
        )}
      </div>
    );
  }

  const wf = deployedWorkflowResponseConversion(deploymentConfig);

  if (wf?.mcpInstances && deploymentConfig?.mcpToolDefinitions) {
    wf.mcpInstances.forEach((mcpInstance) => {
      if (deploymentConfig.mcpToolDefinitions[mcpInstance.id]) {
        mcpInstance.tools = JSON.stringify(deploymentConfig.mcpToolDefinitions[mcpInstance.id]);
      }
    });
  }

  const workflowState: WorkflowState = {
    workflowId: wf?.workflow?.workflow_id,
    name: wf?.workflow?.name,
    description: wf?.workflow?.description,
    workflowMetadata: {
      agentIds: wf?.workflow?.crew_ai_workflow_metadata?.agent_id,
      taskIds: wf?.workflow?.crew_ai_workflow_metadata?.task_id,
      managerAgentId: wf?.workflow?.crew_ai_workflow_metadata?.manager_agent_id,
      process: wf?.workflow?.crew_ai_workflow_metadata?.process,
    },
    isConversational: wf?.workflow?.is_conversational,
  };
  return (
    <WorkflowDiagramView
      workflowState={workflowState}
      toolInstances={wf?.toolInstances}
      mcpInstances={wf?.mcpInstances}
      agents={wf?.agents}
      tasks={wf?.tasks}
      displayDiagnostics={false}
      renderMode="workflow"
    />
  );
};

interface WorkflowOverviewProps {
  workflowId: string;
}

const WorkflowOverview: React.FC<WorkflowOverviewProps> = ({ workflowId }) => {
  const [getWorkflow] = useGetWorkflowMutation();
  const [workflowDetails, setWorkflowDetails] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<'draft' | string | null>('draft');
  const [selectedWorkflowDeployment, setSelectedWorkflowDeployment] =
    useState<DeployedWorkflow | null>(null);
  const dispatch = useAppDispatch();
  const { data: deployedWorkflows = [] } = useListDeployedWorkflowsQuery({});
  const [undeployWorkflow] = useUndeployWorkflowMutation();
  const [suspendDeployedWorkflow] = useSuspendDeployedWorkflowMutation();
  const [resumeDeployedWorkflow] = useResumeDeployedWorkflowMutation();
  const notificationsApi = useGlobalNotification();
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: mcpInstances } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const { data: tasks } = useListTasksQuery({ workflow_id: workflowId });
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const reduxWorkflowState = useAppSelector(selectEditorWorkflow);

  // Get workflow deployments for this specific workflow
  const workflowDeployments = deployedWorkflows.filter(
    (dw) => dw.workflow_id === workflowDetails?.workflow_id,
  );

  // Check if there's any non-diverged(fresh) deployment
  const hasFreshDeployment = workflowDeployments.some((dw) => !dw.stale);

  const handleDraftToggle = () => {
    setExpandedCard(expandedCard === 'draft' ? null : 'draft');
    setSelectedWorkflowDeployment(null);
  };

  const handleDeploymentToggle = (deployment: DeployedWorkflow) => {
    const deploymentId = deployment.deployed_workflow_id;
    const isCurrentlyExpanded = expandedCard === deploymentId;

    if (isCurrentlyExpanded) {
      setExpandedCard(null);
      setSelectedWorkflowDeployment(null);
    } else {
      setExpandedCard(deploymentId);
      setSelectedWorkflowDeployment(deployment);
    }
  };

  useEffect(() => {
    if (hasFreshDeployment && workflowDeployments.length > 0) {
      handleDeploymentToggle(workflowDeployments[0]);
    }
  }, [hasFreshDeployment, workflowDeployments.length]);

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
    } catch (_error) {
      notificationsApi.error({
        message: 'Error',
        description: 'Failed to delete deployment',
        placement: 'topRight',
      });
    }
  };

  const handleSuspendDeployedWorkflow = async (deployedWorkflow: DeployedWorkflow) => {
    try {
      await suspendDeployedWorkflow({
        deployed_workflow_id: deployedWorkflow.deployed_workflow_id,
      }).unwrap();

      notificationsApi.success({
        message: 'Deployment Suspended',
        description: `Successfully suspended deployment "${deployedWorkflow.deployed_workflow_name}"`,
        placement: 'topRight',
      });
    } catch (_error) {
      notificationsApi.error({
        message: 'Error',
        description: 'Failed to suspend deployment',
        placement: 'topRight',
      });
    }
  };

  const handleResumeDeployedWorkflow = async (deployedWorkflow: DeployedWorkflow) => {
    try {
      await resumeDeployedWorkflow({
        deployed_workflow_id: deployedWorkflow.deployed_workflow_id,
      }).unwrap();

      notificationsApi.success({
        message: 'Resuming Deployment',
        description: `Successfully started resuming workflow deployment "${deployedWorkflow.deployed_workflow_name}"`,
        placement: 'topRight',
      });
    } catch (_error) {
      notificationsApi.error({
        message: 'Error',
        description: 'Failed to resume deployment',
        placement: 'topRight',
      });
    }
  };

  if (loading) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Suspense fallback={<Spin size="large" />}>
          <Layout className="flex justify-center items-center h-screen">
            <Spin size="large" />
          </Layout>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Layout className="flex justify-center items-center h-screen">
          <Alert message="Error" description={error} type="error" showIcon />
        </Layout>
      </ErrorBoundary>
    );
  }

  if (!workflowDetails) {
    return (
      <ErrorBoundary fallback={<Alert message="Error loading workflow" type="error" />}>
        <Layout className="flex justify-center items-center h-screen">
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
        <Layout className="flex-1 flex flex-row bg-white rounded h-screen overflow-hidden">
          {/* Left Side: Workflow Details */}
          <Layout.Content className="bg-white overflow-y-auto overflow-x-hidden flex-auto w-2/5">
            {/* Deployments Section */}
            {workflowDeployments.length > 0 && (
              <div className="px-4 pt-4 pb-1.5 bg-white">
                <Title level={5}>Deployment</Title>
                <List
                  grid={{ gutter: 16, column: 1 }}
                  dataSource={workflowDeployments}
                  renderItem={(deployment) => (
                    <List.Item>
                      <DeploymentCard
                        deployment={deployment}
                        onDelete={handleDeleteDeployedWorkflow}
                        onSuspend={handleSuspendDeployedWorkflow}
                        onResume={handleResumeDeployedWorkflow}
                        notificationsApi={notificationsApi}
                        isExpanded={expandedCard === deployment.deployed_workflow_id}
                        onToggle={handleDeploymentToggle}
                        useActualWorkflowData={!deployment.stale}
                        workflowInfo={
                          {
                            workflow: workflowDetails,
                            toolInstances: toolInstances || [],
                            mcpInstances: mcpInstances || [],
                            agents: agents || [],
                            tasks: tasks || [],
                          } as WorkflowInfo
                        }
                      />
                    </List.Item>
                  )}
                  className="mb-2"
                />
              </div>
            )}

            {/* Draft Section - Only show if there are no fresh deployments */}
            {!hasFreshDeployment && (
              <div className="px-4 pt-1.5 pb-4 bg-white">
                <Title level={5}>Draft</Title>
                <DraftCard
                  workflow={workflowDetails}
                  workflowInfo={
                    {
                      workflow: workflowDetails,
                      toolInstances: toolInstances || [],
                      mcpInstances: mcpInstances || [],
                      agents: agents || [],
                      tasks: tasks || [],
                    } as WorkflowInfo
                  }
                  isExpanded={expandedCard === 'draft'}
                  onToggle={handleDraftToggle}
                />
              </div>
            )}
          </Layout.Content>

          <Divider type="vertical" className="h-full flex-grow-0 flex-shrink-0" />

          {/* Right Side: Workflow Diagram */}
          <Layout.Content className="bg-transparent flex-auto w-3/5 relative min-h-0">
            {(expandedCard === 'draft' || hasFreshDeployment) &&
            reduxWorkflowState?.workflowId &&
            workflowDetails ? (
              // Show actual workflow when:
              // 1. There are fresh deployments regardless of the expanded card
              // 2. The draft card is expanded
              <WorkflowDiagramView
                workflowState={reduxWorkflowState}
                toolInstances={toolInstances}
                mcpInstances={mcpInstances}
                agents={agents}
                tasks={tasks}
                displayDiagnostics={false}
                renderMode="workflow"
              />
            ) : selectedWorkflowDeployment &&
              expandedCard === selectedWorkflowDeployment.deployed_workflow_id ? (
              // Show deployed workflow only if there are stale deployments
              <WorkflowDiagramViewForDeployment deployment={selectedWorkflowDeployment} />
            ) : (
              <div className="flex justify-center items-center h-full bg-gray-100">
                <Spin size="large" />
              </div>
            )}
          </Layout.Content>
        </Layout>
      </Suspense>
    </ErrorBoundary>
  );
};

export default WorkflowOverview;
