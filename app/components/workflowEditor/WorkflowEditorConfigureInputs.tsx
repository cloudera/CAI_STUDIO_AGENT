'use client';

import { Alert, Card, Input, Layout, Typography, Tag, Tooltip, Slider, InputNumber } from 'antd';
import { useListToolInstancesQuery } from '../../tools/toolInstancesApi';
import { ToolInstance, AgentMetadata, McpInstance } from '@/studio/proto/agent_studio';
import { useListAgentsQuery } from '../../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
  updatedWorkflowGenerationConfig,
  updatedWorkflowToolParameter,
  updatedWorkflowMcpInstanceParameter,
} from '../../workflows/editorSlice';
import {
  readWorkflowConfigurationFromLocalStorage,
  resetLocalStorageState,
  writeWorkflowConfigurationToLocalStorage,
} from '../../lib/localStorage';
import { WorkflowGenerationConfig, WorkflowConfiguration } from '../../lib/types';
import { InfoCircleOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import { DEFAULT_GENERATION_CONFIG } from '../../lib/constants';
import React from 'react';
import { TOOL_PARAMS_ALERT } from '../../lib/constants';
import { renderAlert } from '../../lib/alertUtils';
import { useListMcpInstancesQuery } from '@/app/mcp/mcpInstancesApi';

const { Title, Text } = Typography;
const { Password } = Input;

export interface ToolConfigurationComponentProps {
  agentName: string;
  toolInstance: ToolInstance;
  workflowId: string;
}

export interface McpConfigurationComponentProps {
  agentName: string;
  mcpInstance: McpInstance;
  workflowId: string;
}

interface ToolParameterMetadata {
  required: boolean;
}

interface ToolInstanceMetadataProps {
  user_params?: string[];
  user_params_metadata?: Record<string, ToolParameterMetadata>;
}

/**
 * Set a workflow tool parameter value, of a specific parameter,
 * of a specific tool, of a specific workflow. Here, workflowConfiguration
 * will mutate.
 */
export const setWorkflowToolParameterInLocalStorage = (
  workflowId: string,
  toolId: string,
  parameterName: string,
  value: string,
): void => {
  try {
    const workflowConfiguration = readWorkflowConfigurationFromLocalStorage(workflowId);

    // Check to see if tool parameters are set
    if (!workflowConfiguration.toolConfigurations) {
      workflowConfiguration.toolConfigurations = {};
    }

    if (!workflowConfiguration.toolConfigurations[toolId]) {
      workflowConfiguration.toolConfigurations[toolId] = {
        parameters: {},
      };
    }

    workflowConfiguration.toolConfigurations[toolId].parameters[parameterName] = value;

    // Write updated state back to localStorage
    writeWorkflowConfigurationToLocalStorage(workflowId, workflowConfiguration);
  } catch (error) {
    console.error('Error setting configuration parameter:', error);
    resetLocalStorageState();
  }
};

export const setWorkflowMcpInstanceParameterInLocalStorage = (
  workflowId: string,
  mcpInstanceId: string,
  envName: string,
  value: string,
): void => {
  try {
    const workflowConfiguration = readWorkflowConfigurationFromLocalStorage(workflowId);

    if (!workflowConfiguration.mcpInstanceConfigurations) {
      workflowConfiguration.mcpInstanceConfigurations = {};
    }

    if (!workflowConfiguration.mcpInstanceConfigurations[mcpInstanceId]) {
      workflowConfiguration.mcpInstanceConfigurations[mcpInstanceId] = {
        parameters: {},
      };
    }

    workflowConfiguration.mcpInstanceConfigurations[mcpInstanceId].parameters[envName] = value;

    writeWorkflowConfigurationToLocalStorage(workflowId, workflowConfiguration);
  } catch (error) {
    console.error('Error setting configuration parameter:', error);
    resetLocalStorageState();
  }
};

/**
 * Set a generation config for this workflow.
 */
export const setGenerationConfig = (
  workflowId: string,
  generationConfig: WorkflowGenerationConfig,
) => {
  // Get local storage.
  const workflowConfiguration = readWorkflowConfigurationFromLocalStorage(workflowId);

  // Check to see if tool parameters are set
  if (!workflowConfiguration.generationConfig) {
    workflowConfiguration.generationConfig = {};
  }

  workflowConfiguration.generationConfig = {
    ...workflowConfiguration.generationConfig,
    ...generationConfig,
  };

  // Write updated state back to localStorage
  writeWorkflowConfigurationToLocalStorage(workflowId, workflowConfiguration);
};

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

const ToolConfigurationComponent: React.FC<ToolConfigurationComponentProps> = ({
  agentName,
  toolInstance,
  workflowId,
}) => {
  const instanceMetadata: ToolInstanceMetadataProps = JSON.parse(toolInstance.tool_metadata);
  const dispatch = useAppDispatch();

  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const toolConfiguration = workflowConfiguration.toolConfigurations[toolInstance.id] || {
    parameters: {},
  };

  if (!instanceMetadata.user_params || instanceMetadata.user_params.length == 0) {
    return <></>;
  }

  return (
    <>
      <Card
        title={
          <Layout className="bg-transparent flex-grow-0 flex-row items-center gap-3">
            <Tag className="bg-[#c3d4fa] m-0">
              <Text className="text-xs font-normal">tool</Text>
            </Tag>
            <Text className="text-sm font-semibold">{toolInstance.name}</Text>
            <Tag className="bg-[#add8e6] m-0">
              <Layout className="flex-row items-center gap-1 bg-transparent p-1">
                <UserOutlined />
                <Text className="text-xs font-normal">Agent: {agentName}</Text>
              </Layout>
            </Tag>
          </Layout>
        }
        className="shadow-md"
      >
        <Layout className="bg-transparent flex-grow-0 flex-col gap-2">
          {instanceMetadata.user_params?.map((param, index) => {
            const isRequired = instanceMetadata.user_params_metadata?.[param]?.required ?? false;
            const isEmpty = !toolConfiguration.parameters[param];
            const showError = isRequired && isEmpty;

            return (
              <Layout key={index} className="flex-col flex-grow-0 bg-transparent">
                <Text className="text-sm font-normal">
                  {param} {isRequired && <Text type="danger">*</Text>}
                </Text>
                <Password
                  status={showError ? 'error' : ''}
                  placeholder={param}
                  value={toolConfiguration.parameters[param]}
                  onChange={(e) => {
                    dispatch(
                      updatedWorkflowToolParameter({
                        workflowId: workflowId,
                        toolInstanceId: toolInstance.id,
                        mcpInstanceId: '',
                        parameterName: param,
                        value: e.target.value,
                      }),
                    );
                    setWorkflowToolParameterInLocalStorage(
                      workflowId,
                      toolInstance.id,
                      param,
                      e.target.value,
                    );
                  }}
                />
                {showError && (
                  <Text type="danger" className="text-xs">
                    This field is required
                  </Text>
                )}
              </Layout>
            );
          })}
        </Layout>
      </Card>
    </>
  );
};

const McpConfigurationComponent: React.FC<McpConfigurationComponentProps> = ({
  agentName,
  mcpInstance,
  workflowId,
}) => {
  const dispatch = useAppDispatch();
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);

  const mcpConfiguration = workflowConfiguration.mcpInstanceConfigurations?.[mcpInstance.id] || {
    parameters: {},
  };

  // If no environment variables to configure, don't render anything
  if (!mcpInstance.env_names || mcpInstance.env_names.length === 0) {
    return <></>;
  }

  return (
    <>
      <Card
        title={
          <Layout className="bg-transparent flex-grow-0 flex-row items-center gap-3">
            <Tag className="bg-[#c3fac3] m-0">
              <Text className="text-xs font-normal">MCP</Text>
            </Tag>
            <Text className="text-sm font-semibold">{mcpInstance.name}</Text>
            <Tag className="bg-[#ffd700] m-0">
              <Layout className="flex-row items-center gap-1 bg-transparent p-1">
                <UserOutlined />
                <Text className="text-xs font-normal">Agent: {agentName}</Text>
              </Layout>
            </Tag>
          </Layout>
        }
        className="shadow-md"
      >
        <Layout className="bg-transparent flex-grow-0 flex-col gap-2">
          {mcpInstance.env_names.map((envName, index) => (
            <Layout key={index} className="flex-col flex-grow-0 bg-transparent">
              <Text className="text-sm font-normal">{envName}</Text>
              <Password
                placeholder={envName}
                value={mcpConfiguration.parameters[envName] || ''}
                onChange={(e) => {
                  dispatch(
                    updatedWorkflowMcpInstanceParameter({
                      workflowId: workflowId,
                      toolInstanceId: '',
                      mcpInstanceId: mcpInstance.id,
                      parameterName: envName,
                      value: e.target.value,
                    }),
                  );
                  setWorkflowMcpInstanceParameterInLocalStorage(
                    workflowId,
                    mcpInstance.id,
                    envName,
                    e.target.value,
                  );
                }}
              />
            </Layout>
          ))}
        </Layout>
      </Card>
    </>
  );
};

interface WorkflowEditorConfigureInputsProps {
  workflowId: string;
}

const WorkflowEditorConfigureInputs: React.FC<WorkflowEditorConfigureInputsProps> = ({
  workflowId,
}) => {
  const { data: agents } = useListAgentsQuery({ workflow_id: workflowId });
  const { data: toolInstances } = useListToolInstancesQuery({ workflow_id: workflowId });
  const { data: mcpInstances } = useListMcpInstancesQuery({ workflow_id: workflowId });
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const dispatch = useAppDispatch();

  // Check if all required parameters are set across all tools
  const hasAllRequiredParams = React.useMemo(() => {
    if (!agents || !toolInstances) {
      return true;
    }

    return agents
      .filter((agent) => agent.workflow_id === workflowId)
      .every((agent) => {
        const toolInstanceIds = agent.tools_id;
        const workflowTools = toolInstances.filter((toolInstance) =>
          toolInstanceIds.includes(toolInstance.id),
        );

        return workflowTools.every((toolInstance) => {
          const metadata: ToolInstanceMetadataProps = JSON.parse(toolInstance.tool_metadata);
          if (!metadata.user_params_metadata) {
            return true;
          }

          const toolConfig = workflowConfiguration.toolConfigurations[toolInstance.id] || {
            parameters: {},
          };

          return Object.entries(metadata.user_params_metadata).every(([param, meta]) => {
            if (meta.required) {
              const value = toolConfig.parameters[param];
              return value !== undefined && value !== '';
            }
            return true;
          });
        });
      });
  }, [agents, toolInstances, workflowConfiguration, workflowId]);

  const hasConfigurableTools = agents
    ?.filter((agent) => agent.workflow_id === workflowId)
    .some((agent) => {
      const toolInstanceIds = agent.tools_id;
      const workflowTools = toolInstances?.filter((toolInstance) =>
        toolInstanceIds.includes(toolInstance.id),
      );
      return workflowTools?.some((tool) => JSON.parse(tool.tool_metadata)?.user_params?.length > 0);
    });

  const hasConfigurableMcpInstances = agents
    ?.filter((agent) => agent.workflow_id === workflowId)
    .some((agent) => {
      const mcpInstanceIds = agent.mcp_instance_ids;
      const workflowMcpInstances = mcpInstances?.filter((mcpInstance) =>
        mcpInstanceIds.includes(mcpInstance.id),
      );
      return workflowMcpInstances?.some((mcpInstance) => mcpInstance.env_names.length > 0);
    });

  const invalidTools = getInvalidTools(agents, toolInstances, workflowId);

  return (
    <Layout className="flex-col p-4 w-[40%] h-full bg-transparent overflow-auto flex-shrink-0 flex-grow-0">
      <Layout className="bg-transparent w-full flex-shrink-0 mb-6">
        <Title level={4} className="mb-4 text-sm font-semibold">
          Agents & Managers
        </Title>
        <Card title={<Text className="font-semibold text-sm">Generation</Text>}>
          <Layout className="bg-transparent flex-col flex gap-3.5">
            <Layout className="bg-transparent flex-row justify-between items-center">
              <div className="justify-start items-center flex-grow-0 flex gap-1">
                <Text className="text-sm font-normal">Max New Tokens</Text>
                <Tooltip
                  title="Determines how many new tokens the agents and manager agent can generate while making LLM calls. There may be LLM endpoint restrictions on this value."
                  placement="right"
                >
                  <QuestionCircleOutlined />
                </Tooltip>
              </div>
              <InputNumber
                value={workflowGenerationConfig.max_new_tokens}
                onChange={(e) => {
                  dispatch(updatedWorkflowGenerationConfig({ max_new_tokens: e || undefined }));
                  writeWorkflowConfigurationToLocalStorage(workflowId!, {
                    ...workflowConfiguration,
                    generationConfig: {
                      ...workflowConfiguration.generationConfig,
                      max_new_tokens: e || undefined,
                    },
                  });
                }}
                className="w-20"
              />
            </Layout>
            <Layout className="bg-transparent flex-row justify-between items-center">
              <div className="justify-start items-center flex-grow-0 flex gap-1">
                <Text className="text-sm font-normal">Temperature</Text>
                <Tooltip
                  title={
                    <>
                      Determines variation/creativity in agent LLM response. A higher temperature
                      value will lead to more varied and creative responses. A lower temperature
                      will lead to less varied and more deterministic responses.
                      <br />
                      <br />
                      NOTE: based on the LLM model used,{' '}
                      <b>exact determinism can not be guaranteed in between workflow runs.</b>
                    </>
                  }
                  placement="right"
                >
                  <QuestionCircleOutlined />
                </Tooltip>
              </div>
              <Slider
                min={0.0}
                max={1.0}
                step={0.01}
                defaultValue={DEFAULT_GENERATION_CONFIG.temperature}
                value={workflowGenerationConfig.temperature}
                onChange={(e) => {
                  dispatch(updatedWorkflowGenerationConfig({ temperature: e }));
                  writeWorkflowConfigurationToLocalStorage(workflowId!, {
                    ...workflowConfiguration,
                    generationConfig: {
                      ...workflowConfiguration.generationConfig,
                      temperature: e,
                    },
                  });
                }}
                className="flex-grow ml-6"
              />
            </Layout>
          </Layout>
        </Card>
      </Layout>

      <Layout className="bg-transparent w-full flex-grow flex-col gap-4">
        {/* Show invalid tools alert if any invalid tools exist */}
        {invalidTools.length > 0 ? (
          <Layout className="bg-transparent w-full flex-shrink-0">
            {renderAlert(
              'Invalid Tools Detected',
              `The following tools are invalid: ${invalidTools.map((t) => `${t.name} (${t.status})`).join(', ')}. Please go to Create or Edit Agent Modal to fix or delete these tools.`,
              'warning',
            )}
          </Layout>
        ) : (
          <>
            {/* Show required params alert and tool configuration only if no invalid tools */}
            {!hasAllRequiredParams && (
              <Layout className="bg-transparent w-full flex-shrink-0">
                {renderAlert(TOOL_PARAMS_ALERT.message, TOOL_PARAMS_ALERT.description, 'warning')}
              </Layout>
            )}

            <Layout className="bg-transparent w-full flex-grow flex-col gap-4">
              <Title level={4} className="mb-4 text-sm font-semibold">
                Tools and MCPs
              </Title>
              {!hasConfigurableTools && !hasConfigurableMcpInstances && (
                <Alert
                  className="mb-4 flex-shrink-0"
                  message={
                    <Layout className="flex-col gap-1 p-0 bg-transparent">
                      <Layout className="flex-row items-center gap-2 bg-transparent">
                        <InfoCircleOutlined className="text-[#1890ff]" />
                        <Text className="text-sm font-semibold bg-transparent">
                          No Configuration Required
                        </Text>
                      </Layout>
                      <Text className="text-sm font-normal bg-transparent">
                        This workflow has no tools or MCPs that require configuration. You can
                        proceed to test and deploy the workflow.
                      </Text>
                    </Layout>
                  }
                  type="info"
                  showIcon={false}
                  closable={false}
                />
              )}
              <Layout className="gap-4 flex-grow bg-transparent">
                {agents
                  ?.filter((agent) => agent.workflow_id === workflowId)
                  .map((agent, _index) => {
                    const toolInstanceIds = agent.tools_id;
                    const worklfowTools = toolInstances?.filter((toolInstance) =>
                      toolInstanceIds.includes(toolInstance.id),
                    );
                    const mcpInstanceIds = agent.mcp_instance_ids;
                    const workflowMcpInstances = mcpInstances?.filter((mcpInstance) =>
                      mcpInstanceIds.includes(mcpInstance.id),
                    );
                    return (
                      <React.Fragment key={agent.id}>
                        {worklfowTools?.map((toolInstance) => (
                          <ToolConfigurationComponent
                            key={toolInstance.id}
                            agentName={agent.name}
                            toolInstance={toolInstance}
                            workflowId={workflowId!}
                          />
                        ))}
                        {workflowMcpInstances?.map((mcpInstance) => (
                          <McpConfigurationComponent
                            key={mcpInstance.id}
                            agentName={agent.name}
                            mcpInstance={mcpInstance}
                            workflowId={workflowId!}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
              </Layout>
            </Layout>
          </>
        )}
      </Layout>
    </Layout>
  );
};

// Export a flag indicating if all required parameters are set
export const hasValidToolConfiguration = (
  workflowId: string,
  agents: AgentMetadata[] | undefined,
  toolInstances: ToolInstance[] | undefined,
  workflowConfiguration: WorkflowConfiguration,
): boolean => {
  if (!agents || !toolInstances) {
    return true;
  }

  const filteredAgents = agents.filter((agent) => agent.workflow_id === workflowId);

  return filteredAgents.every((agent) => {
    const toolInstanceIds = agent.tools_id;
    const workflowTools = toolInstances.filter((toolInstance) =>
      toolInstanceIds.includes(toolInstance.id),
    );

    return workflowTools.every((toolInstance) => {
      const metadata: ToolInstanceMetadataProps = JSON.parse(toolInstance.tool_metadata);

      if (!metadata.user_params_metadata) {
        return true;
      }

      const toolConfig = workflowConfiguration.toolConfigurations[toolInstance.id] || {
        parameters: {},
      };

      const validParams = Object.entries(metadata.user_params_metadata).every(([param, meta]) => {
        if (meta.required) {
          const value = toolConfig.parameters[param];
          const isValid = value !== undefined && value !== '';

          return isValid;
        }
        return true;
      });

      return validParams;
    });
  });
};

export default WorkflowEditorConfigureInputs;
