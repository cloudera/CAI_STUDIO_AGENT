'use client';

import React from 'react';
import { Layout, Typography, List, Space, Avatar, Tag, Image, Tooltip, Collapse } from 'antd';
import { UserOutlined, UsergroupAddOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useListDeployedWorkflowsQuery } from '../../workflows/deployedWorkflowsApi';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import { hasValidToolConfiguration } from '../workflowEditor/WorkflowEditorConfigureInputs';
import { useAppSelector } from '../../lib/hooks/hooks';
import { renderAlert } from '../../lib/alertUtils';
import { TOOL_PARAMS_ALERT } from '../../lib/constants';
import {
  selectEditorWorkflowManagerAgentId,
  selectEditorWorkflowAgentIds,
  selectEditorWorkflowTaskIds,
  selectEditorWorkflowProcess,
  selectWorkflowConfiguration,
} from '../../workflows/editorSlice';
import { useGetDefaultModelQuery } from '../../models/modelsApi';
import { ToolInstance, AgentMetadata } from '@/studio/proto/agent_studio';
import {
  convertTemplateToWorkflowInfo,
  deployedWorkflowResponseConversion,
  WorkflowInfo,
  WorkflowTemplateInfo,
} from '@/app/utils/conversions';
import { usePathname } from 'next/navigation';

const { Title, Text } = Typography;

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

interface WorkflowSubOverviewProps {
  workflowTemplateInfo?: WorkflowTemplateInfo;
  workflowInfo?: WorkflowInfo;
  workflowDeploymentResponse?: any;
  type: 'workflowTemplate' | 'workflow' | 'workflowDeployment';
}

const WorkflowSubOverview: React.FC<WorkflowSubOverviewProps> = ({
  workflowTemplateInfo,
  workflowInfo,
  workflowDeploymentResponse,
  type,
}) => {
  const wf =
    type === 'workflowTemplate'
      ? convertTemplateToWorkflowInfo(workflowTemplateInfo!)
      : type === 'workflowDeployment'
        ? deployedWorkflowResponseConversion(workflowDeploymentResponse!)
        : workflowInfo!;

  const pathname = usePathname();
  const isEditFlow = pathname?.startsWith('/workflows/create') && type === 'workflow';

  const { imageData } = useImageAssetsData([
    ...(Object.values(wf.toolInstances ?? []).map((instance) => instance.tool_image_uri) ?? []),
    ...(Object.values(wf.mcpInstances ?? []).map((instance) => instance.image_uri) ?? []),
    ...(Object.values(wf.agents ?? []).map((agent) => agent.agent_image_uri) ?? []),
  ]);

  const editorManagerAgentId = useAppSelector(selectEditorWorkflowManagerAgentId);
  const editorProcess = useAppSelector(selectEditorWorkflowProcess);
  const editorWorkflowAgentIds = useAppSelector(selectEditorWorkflowAgentIds);
  const editorWorkflowTaskIds = useAppSelector(selectEditorWorkflowTaskIds);
  const managerAgentId = isEditFlow
    ? editorManagerAgentId
    : wf.workflow.crew_ai_workflow_metadata?.manager_agent_id;
  const process = isEditFlow ? editorProcess : wf.workflow.crew_ai_workflow_metadata?.process;
  const workflowAgentIds = isEditFlow
    ? editorWorkflowAgentIds || []
    : wf.agents?.map((agent) => agent.id) || [];
  const workflowTaskIds = isEditFlow
    ? editorWorkflowTaskIds || []
    : wf.tasks?.map((task) => task.task_id) || [];

  const { data: allWorkflowDeployments } = useListDeployedWorkflowsQuery({});
  const deploymentsToThisWorkflow =
    type === 'workflow'
      ? allWorkflowDeployments?.filter((d) => d.workflow_id === wf.workflow.workflow_id) || []
      : [];

  const { data: defaultModel } = useGetDefaultModelQuery();

  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);

  const isValid = isEditFlow
    ? hasValidToolConfiguration(
        wf.workflow.workflow_id,
        wf.agents,
        wf.toolInstances,
        workflowConfiguration,
      )
    : true;

  const invalidTools = getInvalidTools(wf.agents, wf.toolInstances, wf.workflow.workflow_id);

  const managerAgent = wf.agents?.find((agent) => agent.id === managerAgentId);
  const workflowAgents = wf.agents?.filter((agent) => workflowAgentIds.includes(agent.id));
  const workflowTasks = wf.tasks?.filter((task) => workflowTaskIds.includes(task.task_id));

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
                const toolInstance = wf.toolInstances?.find((t) => t.id === resourceId);
                const mcpInstance = wf.mcpInstances?.find((m) => m.id === resourceId);
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
    const assignedAgent = wf.agents?.find((agent) => agent.id === task.assigned_agent_id);

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

  const hasAgents = (wf.workflow.crew_ai_workflow_metadata?.agent_id?.length ?? 0) > 0;
  const hasTasks = (wf.workflow.crew_ai_workflow_metadata?.task_id?.length ?? 0) > 0;

  const hasManagerAgent = wf.workflow.crew_ai_workflow_metadata?.process === 'hierarchical';
  const hasDefaultManager =
    hasManagerAgent && !wf.workflow.crew_ai_workflow_metadata?.manager_agent_id;

  const hasUnassignedTasks =
    !hasManagerAgent && !hasDefaultManager
      ? (wf.workflow.crew_ai_workflow_metadata?.task_id?.some((taskId: string) => {
          const task = wf.tasks?.find((t) => t.task_id === taskId);
          return task && !task.assigned_agent_id;
        }) ?? false)
      : false;

  const renderAlertLocal = (
    message: string,
    description: string,
    type: 'info' | 'warning' | 'error' | 'loading',
  ) => {
    return <div className="pb-1">{renderAlert(message, description, type)}</div>;
  };

  return (
    <Layout className="p-4 bg-white">
      {isEditFlow &&
        (!defaultModel
          ? renderAlertLocal(
              'No Default LLM Model',
              'Please configure a default LLM model in the Models section to use workflows.',
              'warning',
            )
          : invalidTools.length > 0
            ? renderAlertLocal(
                'Invalid Tools Detected',
                `The following tools are invalid: ${invalidTools.map((t) => `${t.name} (${t.status})`).join(', ')}. Please go to Create or Edit Agent Modal to fix or delete these tools.`,
                'warning',
              )
            : !isValid
              ? renderAlertLocal(
                  TOOL_PARAMS_ALERT.message,
                  TOOL_PARAMS_ALERT.description,
                  'warning',
                )
              : !wf.workflow.is_ready
                ? renderAlertLocal(
                    'Workflow Not Ready',
                    'This workflow is still being configured...',
                    'info',
                  )
                : !hasAgents
                  ? renderAlertLocal(
                      'No Agents Found',
                      'This workflow does not have any agents. You need at least one agent to test or deploy the workflow.',
                      'warning',
                    )
                  : !hasTasks
                    ? renderAlertLocal(
                        'No Tasks Found',
                        'This workflow does not have any tasks. You need at least one task to test or deploy the workflow.',
                        'warning',
                      )
                    : hasUnassignedTasks
                      ? renderAlertLocal(
                          'Unassigned Tasks',
                          'You need to assign tasks to an agent because there is no manager agent.',
                          'warning',
                        )
                      : deploymentsToThisWorkflow.length > 0
                        ? renderAlertLocal(
                            'Existing Deployment',
                            'There is an existing deployment for this workflow. ' +
                              'Re-deploying will refresh the deployment with fresh changes while maintaining the same model endpoints & application URL.',
                            'info',
                          )
                        : null)}
      {wf.workflow.description.length > 0 && (
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
                    {wf.workflow.description}
                  </Text>
                </div>
              ),
            },
          ]}
        />
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

export default WorkflowSubOverview;
