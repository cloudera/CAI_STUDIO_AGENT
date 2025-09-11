import React from 'react';
import {
  Layout,
  Typography,
  List,
  Spin,
  Alert,
  Space,
  Image,
  Tooltip,
  Button,
  Tag,
  Avatar,
  Collapse,
  Dropdown,
  MenuProps,
} from 'antd';
import {
  UserOutlined,
  DeleteOutlined,
  UsergroupAddOutlined,
  FileDoneOutlined,
  ExportOutlined,
  DeploymentUnitOutlined,
  AppstoreOutlined,
  ApiOutlined,
  MoreOutlined,
  PoweroffOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useListAgentsQuery } from '../../agents/agentApi';
import { useListTasksQuery } from '../../tasks/tasksApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { useAppSelector } from '../../lib/hooks/hooks';
import {
  selectEditorWorkflowManagerAgentId,
  selectEditorWorkflowAgentIds,
  selectEditorWorkflowTaskIds,
  selectEditorWorkflowProcess,
  selectWorkflowConfiguration,
} from '../../workflows/editorSlice';
import { AgentMetadata, DeployedWorkflow, ToolInstance } from '@/studio/proto/agent_studio';
import { getStatusColor, getStatusDisplay } from './WorkflowListItem';
import { useGlobalNotification } from '../Notifications';
import { useGetDefaultModelQuery } from '../../models/modelsApi';
import { TOOL_PARAMS_ALERT } from '../../lib/constants';
import { hasValidToolConfiguration } from '../workflowEditor/WorkflowEditorConfigureInputs';
import { renderAlert } from '../../lib/alertUtils';
import { usePathname } from 'next/navigation';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';

const { Title, Text } = Typography;

interface WorkflowDetailsProps {
  workflowId: string;
  workflow: any; // Update this type based on your workflow type
  deployedWorkflows: DeployedWorkflow[];
  onDeleteDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
  onSuspendDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
  onResumeDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
}

const getInvalidTools = (
  agents: AgentMetadata[] | undefined,
  toolInstances: ToolInstance[] | undefined,
  workflowId: string | undefined,
) => {
  if (!agents || !toolInstances || !workflowId) {
    return [];
  }

  const invalidTools: { name: string; status: string }[] = [];

  agents
    .filter((agent) => agent.workflow_id === workflowId)
    .forEach((agent) => {
      agent.tools_id.forEach((toolId) => {
        const tool = toolInstances.find((t) => t.id === toolId);
        if (tool && !tool.is_valid) {
          const status = tool.tool_metadata
            ? JSON.parse(
                typeof tool.tool_metadata === 'string'
                  ? tool.tool_metadata
                  : JSON.stringify(tool.tool_metadata),
              ).status
            : 'Unknown error';
          invalidTools.push({ name: tool.name, status });
        }
      });
    });

  return invalidTools;
};

const WorkflowDetails: React.FC<WorkflowDetailsProps> = ({
  workflowId,
  workflow,
  deployedWorkflows,
  onDeleteDeployedWorkflow,
  onSuspendDeployedWorkflow,
  onResumeDeployedWorkflow,
}) => {
  const pathname = usePathname();
  const isViewRoute = pathname?.startsWith('/workflows/view/');

  const {
    data: allAgents = [],
    isLoading: agentsLoading,
    error: agentsError,
  } = useListAgentsQuery({ workflow_id: workflowId });

  const {
    data: toolInstances = [],
    isLoading: toolInstancesLoading,
    error: toolInstancesError,
  } = useListToolInstancesQuery({ workflow_id: workflowId });

  const {
    data: mcpInstances = [],
    isLoading: mcpInstancesLoading,
    error: mcpInstancesError,
  } = useListMcpInstancesQuery({ workflow_id: workflowId });

  const {
    data: tasks = [],
    isLoading: _tasksLoading,
    error: tasksError,
  } = useListTasksQuery({ workflow_id: workflowId });

  const { imageData } = useImageAssetsData([
    ...(Object.values(toolInstances).map((instance) => instance.tool_image_uri) ?? []),
    ...(Object.values(mcpInstances).map((instance) => instance.image_uri) ?? []),
    ...(Object.values(allAgents).map((agent) => agent.agent_image_uri) ?? []),
  ]);

  const managerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const process = useAppSelector(selectEditorWorkflowProcess);
  const workflowAgentIds = useAppSelector(selectEditorWorkflowAgentIds) || [];
  const workflowTaskIds = useAppSelector(selectEditorWorkflowTaskIds) || [];

  const notificationsApi = useGlobalNotification();

  const { data: defaultModel } = useGetDefaultModelQuery();

  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);

  const isValid = hasValidToolConfiguration(
    workflow.workflow_id,
    allAgents,
    toolInstances,
    workflowConfiguration,
  );

  const invalidTools = getInvalidTools(allAgents, toolInstances, workflow.workflow_id);

  if (agentsLoading || toolInstancesLoading || mcpInstancesLoading) {
    return (
      <Layout className="h-screen flex justify-center items-center">
        <Spin size="large" />
      </Layout>
    );
  }

  if (agentsError || tasksError || toolInstancesError || mcpInstancesError) {
    return (
      <Layout className="h-screen flex justify-center items-center">
        <Alert
          message="Error"
          description={
            agentsError?.toString() || tasksError?.toString() || toolInstancesError?.toString()
          }
          type="error"
          showIcon
        />
      </Layout>
    );
  }

  const managerAgent = allAgents.find((agent) => agent.id === managerAgentId);
  const workflowAgents = allAgents.filter((agent) => workflowAgentIds.includes(agent.id));
  const workflowTasks = tasks.filter((task) => workflowTaskIds.includes(task.task_id));

  const showDefaultManagerEnablement = !managerAgent && Boolean(process === 'hierarchical');

  const renderAgentCard = (agent: AgentMetadata, isManager: boolean = false) => (
    <Layout
      key={agent.id}
      className="rounded border border-[#f0f0f0] bg-white w-full h-[150px] p-0 flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
    >
      <Layout className="flex-1 bg-transparent flex flex-col overflow-auto">
        <div className="px-6 py-4 flex flex-row items-center gap-3">
          <Avatar
            className={`shadow-[0_2px_4px_rgba(0,0,0,0.2)] min-w-[24px] min-h-[24px] w-6 h-6 flex-none ${isManager ? 'bg-gray-300' : imageData[agent.agent_image_uri] ? 'bg-[#b8d6ff]' : 'bg-[#78b2ff]'} ${!isManager && imageData[agent.agent_image_uri] ? 'p-1' : ''}`}
            size={24}
            icon={
              isManager ? (
                <UsergroupAddOutlined />
              ) : imageData[agent.agent_image_uri] ? (
                <Image src={imageData[agent.agent_image_uri]} />
              ) : (
                <UserOutlined />
              )
            }
          />
          <Text
            className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
            title={agent.name}
          >
            {agent.name}
          </Text>
        </div>
        <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
          Goal:{' '}
          <span className="text-black font-normal">
            {agent.crew_ai_agent_metadata?.goal || 'N/A'}
          </span>
        </Text>
        <Text className="px-6 text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mt-2">
          Backstory:{' '}
          <span className="text-black font-normal">
            {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
          </span>
        </Text>
        {(agent.tools_id?.length > 0 || agent.mcp_instance_ids?.length > 0) && (
          <Space className="mt-3 px-6 flex flex-wrap gap-2.5">
            {(agent.tools_id || [])
              .concat(agent.mcp_instance_ids || [])
              .map((resourceId: string) => {
                const toolInstance = toolInstances.find((t) => t.id === resourceId);
                const mcpInstance = mcpInstances.find((m) => m.id === resourceId);
                const resourceType: 'tool' | 'mcp' = toolInstance ? 'tool' : 'mcp';
                const imageUri =
                  resourceType === 'tool' ? toolInstance?.tool_image_uri : mcpInstance?.image_uri;
                const resourceName =
                  resourceType === 'tool'
                    ? toolInstance?.name || resourceId
                    : mcpInstance?.name || resourceId;
                const imageSrc =
                  imageUri && imageData[imageUri]
                    ? imageData[imageUri]
                    : resourceType === 'tool'
                      ? '/fallback-image.png'
                      : '/mcp-icon.svg';

                return (
                  <Tooltip title={resourceName} key={resourceId} placement="top">
                    <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center cursor-pointer">
                      <Image
                        src={imageSrc}
                        alt={resourceName}
                        width={16}
                        height={16}
                        preview={false}
                        className="rounded object-cover w-4 h-4"
                      />
                    </div>
                  </Tooltip>
                );
              })}
          </Space>
        )}
      </Layout>
    </Layout>
  );

  const renderTaskCard = (task: any, index: number) => {
    const assignedAgent = allAgents.find((agent) => agent.id === task.assigned_agent_id);

    return (
      <Layout
        key={`task-${index}`}
        className="relative flex flex-row items-center justify-between h-[44px] shadow-[0_2px_4px_rgba(0,0,0,0.1)] border-0 gap-1.5 pl-12 pr-3 bg-white w-4/5"
      >
        <Avatar
          className="absolute left-6 shadow-[0_2px_4px_rgba(0,0,0,0.2)] bg-[#26bd67] min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
          size={24}
          icon={<FileDoneOutlined />}
        />
        <Text ellipsis className="flex-[0_0_60%] text-[13px] font-normal ml-3">
          <span className="font-semibold">{`Task ${index + 1}: `}</span>
          {task.description}
        </Text>
        {!managerAgentId && !(process === 'hierarchical') && (
          <div className="w-[30%] flex justify-start overflow-hidden">
            <Tooltip title={assignedAgent?.name || 'Unassigned'}>
              <Tag
                icon={<UserOutlined />}
                className="max-w-full text-[11px] font-normal bg-[#add8e6] border-none text-ellipsis overflow-hidden whitespace-nowrap flex items-center px-2 gap-1"
              >
                <span className="max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap block">
                  {assignedAgent?.name || 'Unassigned'}
                </span>
              </Tag>
            </Tooltip>
          </div>
        )}
      </Layout>
    );
  };

  const renderDeploymentCard = (deployment: DeployedWorkflow) => {
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
        onClick: () => onResumeDeployedWorkflow(deployment),
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
            onSuspendDeployedWorkflow(deployment);
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
        // Handle delete with confirmation
        const handleDelete = () => onDeleteDeployedWorkflow(deployment);

        // Create a confirmation dialog
        const modal = window.confirm('Are you sure you want to delete this deployment?');
        if (modal) {
          handleDelete();
        }
      },
    });

    return (
      <div
        key={deployment.deployed_workflow_id}
        className="flex items-center justify-between p-4 border border-[#f0f0f0] rounded bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] mb-3"
      >
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
          <Button type="text" icon={<MoreOutlined />} className="flex-none" />
        </Dropdown>
      </div>
    );
  };

  const workflowDeployments = deployedWorkflows.filter(
    (dw) => dw.workflow_id === workflow.workflow_id,
  );
  const hasAgents = (workflow.crew_ai_workflow_metadata?.agent_id?.length ?? 0) > 0;
  const hasTasks = (workflow.crew_ai_workflow_metadata?.task_id?.length ?? 0) > 0;

  const hasManagerAgent = workflow.crew_ai_workflow_metadata?.process === 'hierarchical';
  const hasDefaultManager =
    hasManagerAgent && !workflow.crew_ai_workflow_metadata?.manager_agent_id;

  const hasUnassignedTasks =
    !hasManagerAgent && !hasDefaultManager
      ? (workflow.crew_ai_workflow_metadata?.task_id?.some((taskId: string) => {
          const task = tasks?.find((t) => t.task_id === taskId);
          return task && !task.assigned_agent_id;
        }) ?? false)
      : false;

  return (
    <Layout className="p-4 bg-white">
      {!isViewRoute &&
        (!defaultModel
          ? renderAlert(
              'No Default LLM Model',
              'Please configure a default LLM model in the Models section to use workflows.',
              'warning',
            )
          : invalidTools.length > 0
            ? renderAlert(
                'Invalid Tools Detected',
                `The following tools are invalid: ${invalidTools.map((t) => `${t.name} (${t.status})`).join(', ')}. Please go to Create or Edit Agent Modal to fix or delete these tools.`,
                'warning',
              )
            : !isValid
              ? renderAlert(TOOL_PARAMS_ALERT.message, TOOL_PARAMS_ALERT.description, 'warning')
              : !workflow?.is_ready
                ? renderAlert(
                    'Workflow Not Ready',
                    'This workflow is still being configured...',
                    'info',
                  )
                : !hasAgents
                  ? renderAlert(
                      'No Agents Found',
                      'This workflow does not have any agents. You need at least one agent to test or deploy the workflow.',
                      'warning',
                    )
                  : !hasTasks
                    ? renderAlert(
                        'No Tasks Found',
                        'This workflow does not have any tasks. You need at least one task to test or deploy the workflow.',
                        'warning',
                      )
                    : hasUnassignedTasks
                      ? renderAlert(
                          'Unassigned Tasks',
                          'You need to assign tasks to an agent because there is no manager agent.',
                          'warning',
                        )
                      : workflowDeployments.length > 0
                        ? renderAlert(
                            'Existing Deployment',
                            'There is an existing deployment for this workflow. ' +
                              'Re-deploying will refresh the deployment with fresh changes while maintaining the same model endpoints & application URL.',
                            'info',
                          )
                        : null)}
      <Collapse
        className="mb-3"
        bordered={false}
        items={[
          {
            key: '1',
            label: 'Capability Guide',
            children: (
              <div className="max-h-[130px] overflow-y-auto">
                <Text className="text-sm font-normal bg-transparent italic block">
                  {workflow.description}
                </Text>
              </div>
            ),
          },
        ]}
      />
      {workflowDeployments.length > 0 && (
        <>
          <Title level={5}>Deployments</Title>
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={workflowDeployments}
            renderItem={(deployment) => <List.Item>{renderDeploymentCard(deployment)}</List.Item>}
            className="mb-5"
          />
        </>
      )}

      {managerAgent && (
        <>
          <Title level={5}>Manager Agent</Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[managerAgent]}
            renderItem={(agent) => <List.Item>{renderAgentCard(agent, true)}</List.Item>}
          />
        </>
      )}

      {showDefaultManagerEnablement && (
        <>
          <Title level={5} className="mt-5">
            Manager Agent
          </Title>
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={[
              {
                id: 'default-manager',
                name: 'Default Manager',
                crew_ai_agent_metadata: {
                  goal: 'Uses default LLM model to manage workflow tasks',
                  backstory: null,
                },
              },
            ]}
            renderItem={() => (
              <List.Item>
                <Layout
                  className="rounded border border-[#f0f0f0] bg-white w-full h-[40px] p-0 flex flex-row items-center cursor-pointer transition-transform transition-shadow duration-200 shadow-md"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.03)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <div className="p-2 px-6 flex flex-row items-center gap-3">
                    <Avatar
                      className="shadow-md bg-gray-300 min-w-[24px] min-h-[24px] w-6 h-6 flex-none"
                      size={24}
                      icon={<UsergroupAddOutlined />}
                    />
                    <Text className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis leading-6">
                      Default Manager
                    </Text>
                  </div>
                </Layout>
              </List.Item>
            )}
          />
        </>
      )}

      <Title level={5} className="mt-5">
        Agents
      </Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={workflowAgents}
        renderItem={(agent) => <List.Item>{renderAgentCard(agent, false)}</List.Item>}
      />

      <Title level={5} className="mt-5">
        Tasks
      </Title>
      <List
        dataSource={workflowTasks}
        renderItem={(task, index) => <List.Item>{renderTaskCard(task, index)}</List.Item>}
      />
    </Layout>
  );
};

export default WorkflowDetails;
