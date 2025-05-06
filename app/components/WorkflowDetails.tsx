import React, { useState, useEffect } from 'react';
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
  Table,
  Popconfirm,
  Avatar,
  Divider,
  Collapse,
} from 'antd';
import {
  UserOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  UsergroupAddOutlined,
  FileDoneOutlined,
  WarningOutlined,
  ExportOutlined,
  DeploymentUnitOutlined,
  AppstoreOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useListAgentsQuery } from '../agents/agentApi';
import { useListTasksQuery } from '../tasks/tasksApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { useListToolInstancesQuery } from '../tools/toolInstancesApi';
import { useAppSelector } from '../lib/hooks/hooks';
import {
  selectEditorWorkflowManagerAgentId,
  selectEditorWorkflowAgentIds,
  selectEditorWorkflowTaskIds,
  selectEditorWorkflowProcess,
  selectWorkflowConfiguration,
} from '../workflows/editorSlice';
import { AgentMetadata, DeployedWorkflow, ToolInstance } from '@/studio/proto/agent_studio';
import { getStatusColor, getStatusDisplay } from './WorkflowListItem';
import { useGlobalNotification } from './Notifications';
import { useGetDefaultModelQuery } from '../models/modelsApi';
import { TOOL_PARAMS_ALERT } from '../lib/constants';
import { hasValidToolConfiguration } from './WorkflowEditorConfigureInputs';
import { renderAlert } from '../lib/alertUtils';
import { usePathname } from 'next/navigation';

const { Title, Text } = Typography;

interface WorkflowDetailsProps {
  workflow: any; // Update this type based on your workflow type
  deployedWorkflows: DeployedWorkflow[];
  onDeleteDeployedWorkflow: (deployedWorkflow: DeployedWorkflow) => void;
}

const getInvalidTools = (agents: AgentMetadata[] | undefined, toolInstances: ToolInstance[] | undefined, workflowId: string | undefined) => {
  if (!agents || !toolInstances || !workflowId) return [];
  
  const invalidTools: { name: string; status: string }[] = [];
  
  agents.filter(agent => agent.workflow_id === workflowId).forEach(agent => {
    agent.tools_id.forEach(toolId => {
      const tool = toolInstances.find(t => t.id === toolId);
      if (tool && !tool.is_valid) {
        const status = tool.tool_metadata ? 
          JSON.parse(typeof tool.tool_metadata === 'string' ? tool.tool_metadata : JSON.stringify(tool.tool_metadata)).status 
          : 'Unknown error';
        invalidTools.push({ name: tool.name, status });
      }
    });
  });
  
  return invalidTools;
};

const WorkflowDetails: React.FC<WorkflowDetailsProps> = ({
  workflow,
  deployedWorkflows,
  onDeleteDeployedWorkflow,
}) => {
  const pathname = usePathname();
  const isViewRoute = pathname?.startsWith('/workflows/view/');

  const {
    data: allAgents = [],
    isLoading: agentsLoading,
    error: agentsError,
  } = useListAgentsQuery({});

  const {
    data: toolInstances = [],
    isLoading: toolInstancesLoading,
    error: toolInstancesError,
  } = useListToolInstancesQuery({});

  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useListTasksQuery({});

  const { imageData } = useImageAssetsData([
    ...(Object.values(toolInstances).map((instance) => instance.tool_image_uri) ?? []),
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
    workflowConfiguration
  );

  const invalidTools = getInvalidTools(allAgents, toolInstances, workflow.workflow_id);

  if (agentsLoading || toolInstancesLoading) {
    return (
      <Layout
        style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Spin size="large" />
      </Layout>
    );
  }

  if (agentsError || tasksError || toolInstancesError) {
    return (
      <Layout
        style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
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
      style={{
        borderRadius: '4px',
        border: 'solid 1px #f0f0f0',
        backgroundColor: '#fff',
        width: '100%',
        height: '150px',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Avatar
            style={{
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              backgroundColor: isManager
                ? 'lightgrey'
                : imageData[agent.agent_image_uri]
                  ? '#b8d6ff'
                  : '#78b2ff',
              minWidth: '24px',
              minHeight: '24px',
              width: '24px',
              height: '24px',
              flex: '0 0 24px',
              padding: isManager ? 0 : imageData[agent.agent_image_uri] ? 5 : 0,
            }}
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
            style={{
              fontSize: '14px',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={agent.name}
          >
            {agent.name}
          </Text>
        </div>
        <Text
          style={{
            padding: '0 24px',
            fontSize: '11px',
            opacity: 0.45,
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Goal:{' '}
          <span style={{ color: 'black', fontWeight: 400 }}>
            {agent.crew_ai_agent_metadata?.goal || 'N/A'}
          </span>
        </Text>
        <Text
          style={{
            padding: '0 24px',
            fontSize: '11px',
            opacity: 0.45,
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: '8px',
          }}
        >
          Backstory:{' '}
          <span style={{ color: 'black', fontWeight: 400 }}>
            {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
          </span>
        </Text>
        {agent.tools_id?.length > 0 && (
          <Space
            style={{
              marginTop: '12px',
              paddingLeft: '24px',
              paddingRight: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {agent.tools_id.map((toolId: string) => {
              const toolInstance = toolInstances.find((t) => t.id === toolId);
              const imageUri = toolInstance?.tool_image_uri;
              const toolName = toolInstance?.name || toolId;
              const imageSrc =
                imageUri && imageData[imageUri] ? imageData[imageUri] : '/fallback-image.png';
              return (
                <Tooltip title={toolName} key={toolId} placement="top">
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#f1f1f1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Image
                      src={imageSrc}
                      alt={toolName}
                      width={16}
                      height={16}
                      preview={false}
                      style={{
                        borderRadius: '2px',
                        objectFit: 'cover',
                      }}
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
        style={{
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          borderWidth: 0,
          gap: 6,
          paddingLeft: 48,
          paddingRight: 12,
          background: 'white',
          width: '80%',
        }}
      >
        <Avatar
          style={{
            position: 'absolute',
            left: 24,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            backgroundColor: '#26bd67',
            minWidth: '24px',
            minHeight: '24px',
            width: '24px',
            height: '24px',
            flex: '0 0 24px',
          }}
          size={24}
          icon={<FileDoneOutlined />}
        />
        <Text
          ellipsis
          style={{ flexBasis: '60%', fontSize: 13, fontWeight: 400, marginLeft: '12px' }}
        >
          <span style={{ fontWeight: 600 }}>{`Task ${index + 1}: `}</span>
          {task.description}
        </Text>
        {!managerAgentId && !Boolean(process === 'hierarchical') && (
          <div
            style={{
              width: '30%',
              display: 'flex',
              justifyContent: 'flex-start',
              overflow: 'hidden',
            }}
          >
            <Tooltip title={assignedAgent?.name || 'Unassigned'}>
              <Tag
                icon={<UserOutlined />}
                style={{
                  maxWidth: '100%',
                  fontSize: 11,
                  fontWeight: 400,
                  backgroundColor: '#add8e6',
                  border: 'none',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingRight: 8,
                  gap: 4,
                }}
              >
                <span
                  style={{
                    maxWidth: '80%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {assignedAgent?.name || 'Unassigned'}
                </span>
              </Tag>
            </Tooltip>
          </div>
        )}
      </Layout>
    );
  };

  const renderDeploymentCard = (deployment: DeployedWorkflow) => (
    <Layout
      key={deployment.deployed_workflow_id}
      style={{
        borderRadius: '4px',
        border: 'solid 1px #f0f0f0',
        backgroundColor: '#fff',
        width: '100%',
        height: '150px',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Layout
        style={{
          flex: 1,
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Avatar
            style={{
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              backgroundColor: '#1890ff',
              minWidth: '24px',
              minHeight: '24px',
              width: '24px',
              height: '24px',
              flex: '0 0 24px',
            }}
            size={24}
            icon={<DeploymentUnitOutlined />}
          />
          <Text
            style={{
              fontSize: '14px',
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={deployment.deployed_workflow_name}
          >
            {deployment.deployed_workflow_name}
          </Text>
        </div>
        <div style={{ padding: '0 24px' }}>
          <Tag
            color={getStatusColor(deployment.application_status || '')}
            style={{
              borderRadius: '12px',
              color:
                deployment.application_status?.toLowerCase() === 'unknown' ? 'white' : undefined,
            }}
          >
            {getStatusDisplay(deployment.application_status || '')}
          </Tag>
        </div>
      </Layout>
      <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
      <Layout
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 0,
          background: 'transparent',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px',
        }}
      >
        <Tooltip title="Open Application UI">
          <Button
            type="link"
            icon={<ExportOutlined />}
            disabled={!deployment.application_status?.toLowerCase().includes('run')}
            onClick={() => {
              if (deployment.application_url && deployment.application_url.length > 0) {
                window.open(deployment.application_url, '_blank');
              } else {
                notificationsApi.error({
                  message: `Can't open application while it is ${getStatusDisplay(deployment.application_status || '')}`,
                  placement: 'topRight',
                });
              }
            }}
          />
        </Tooltip>
        <Divider type="vertical" style={{ height: '20px', margin: 0 }} />
        <Tooltip title="Open Cloudera AI Workbench Application">
          <Button
            type="link"
            icon={<AppstoreOutlined />}
            onClick={() => {
              if (deployment.application_deep_link) {
                window.open(deployment.application_deep_link, '_blank');
              }
            }}
            disabled={!deployment.application_deep_link}
          />
        </Tooltip>
        <Divider type="vertical" style={{ height: '20px', margin: 0 }} />
        <Tooltip title="Open Cloudera AI Workbench Model">
          <Button
            type="link"
            icon={<ApiOutlined />}
            onClick={() => {
              if (deployment.model_deep_link) {
                window.open(deployment.model_deep_link, '_blank');
              }
            }}
            disabled={!deployment.model_deep_link}
          />
        </Tooltip>
        <Divider type="vertical" style={{ height: '20px', margin: 0 }} />
        <Popconfirm
          title="Delete Deployment"
          description="Are you sure you want to delete this deployment?"
          onConfirm={() => onDeleteDeployedWorkflow(deployment)}
          okText="Yes"
          cancelText="No"
        >
          <Button type="link" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      </Layout>
    </Layout>
  );

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
    <Layout style={{ padding: '16px', background: '#fff' }}>
      {!isViewRoute && (
        !defaultModel
          ? renderAlert(
              'No Default LLM Model',
              'Please configure a default LLM model in the Models section to use workflows.',
              'warning',
            )
          : invalidTools.length > 0
            ? renderAlert(
                'Invalid Tools Detected',
                `The following tools are invalid: ${invalidTools.map(t => `${t.name} (${t.status})`).join(', ')}. Please go to Create or Edit Agent Modal to fix or delete these tools.`,
                'warning'
              )
            : !isValid
              ? renderAlert(
                  TOOL_PARAMS_ALERT.message,
                  TOOL_PARAMS_ALERT.description,
                  'warning',
                )
              : !workflow?.is_ready
                ? renderAlert('Workflow Not Ready', 'This workflow is still being configured...', 'info')
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
                            'There is an existing deployment for this workflow. Please delete it first to redeploy the workflow.',
                            'warning',
                          )
                        : null
      )}
      <Collapse
        style={{ marginBottom: '12px' }}
        bordered={false}
        items={[
          {
            key: '1',
            label: 'Capability Guide',
            children: (
              <div style={{ maxHeight: '130px', overflowY: 'auto' }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    background: 'transparent',
                    fontStyle: 'italic',
                    display: 'block',
                  }}
                >
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
            grid={{ gutter: 16, column: 2 }}
            dataSource={workflowDeployments}
            renderItem={(deployment) => <List.Item>{renderDeploymentCard(deployment)}</List.Item>}
            style={{ marginBottom: '20px' }}
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
          <Title level={5} style={{ marginTop: '20px' }}>
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
                  style={{
                    borderRadius: '4px',
                    border: 'solid 1px #f0f0f0',
                    backgroundColor: '#fff',
                    width: '100%',
                    height: '40px',
                    padding: '0',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.03)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <div
                    style={{
                      padding: '8px 24px',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <Avatar
                      style={{
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        backgroundColor: 'lightgrey',
                        minWidth: '24px',
                        minHeight: '24px',
                        width: '24px',
                        height: '24px',
                        flex: '0 0 24px',
                      }}
                      size={24}
                      icon={<UsergroupAddOutlined />}
                    />
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: '24px',
                      }}
                    >
                      Default Manager
                    </Text>
                  </div>
                </Layout>
              </List.Item>
            )}
          />
        </>
      )}

      <Title level={5} style={{ marginTop: '20px' }}>
        Agents
      </Title>
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={workflowAgents}
        renderItem={(agent) => <List.Item>{renderAgentCard(agent, false)}</List.Item>}
      />

      <Title level={5} style={{ marginTop: '20px' }}>
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
