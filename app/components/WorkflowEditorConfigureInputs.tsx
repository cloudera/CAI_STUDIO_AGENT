'use client';

import {
  Alert,
  Card,
  Input,
  Layout,
  Typography,
  Tag,
  Divider,
  Tooltip,
  Slider,
  InputNumber,
} from 'antd';
import { useListToolInstancesQuery } from '../tools/toolInstancesApi';
import { ToolInstance, AgentMetadata } from '@/studio/proto/agent_studio';
import { useListAgentsQuery } from '../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../lib/hooks/hooks';
import {
  selectEditorWorkflowId,
  selectWorkflowConfiguration,
  selectWorkflowGenerationConfig,
  updatedWorkflowConfiguration,
  updatedWorkflowGenerationConfig,
  updatedWorkflowToolParameter,
} from '../workflows/editorSlice';
import {
  readWorkflowConfigurationFromLocalStorage,
  writeWorkflowConfigurationToLocalStorage,
} from '../lib/localStorage';
import { WorkflowGenerationConfig, WorkflowConfiguration } from '../lib/types';
import { InfoCircleOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import { DEFAULT_GENERATION_CONFIG } from '../lib/constants';
import React from 'react';
import { TOOL_PARAMS_ALERT } from '../lib/constants';
import { renderAlert } from '../lib/alertUtils';

const { Title, Text } = Typography;
const { Password } = Input;

export interface ToolConfigurationComponentProps {
  agentName: string;
  toolInstance: ToolInstance;
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

  // Check if all required parameters are set
  const hasAllRequiredParams = React.useMemo(() => {
    if (!instanceMetadata.user_params_metadata) return true;
    
    return Object.entries(instanceMetadata.user_params_metadata).every(([param, metadata]) => {
      if (metadata.required) {
        const value = toolConfiguration.parameters[param];
        return value !== undefined && value !== '';
      }
      return true;
    });
  }, [instanceMetadata.user_params_metadata, toolConfiguration.parameters]);

  if (!instanceMetadata.user_params || instanceMetadata.user_params.length == 0) {
    return <></>;
  }

  return (
    <>
      <Card
        title={
          <Layout
            style={{
              background: 'transparent',
              flexGrow: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Text style={{ fontWeight: 500 }}>{toolInstance.name}</Text>
            <Tag style={{ background: '#add8e6', margin: 0 }}>
              <Layout
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  background: 'transparent',
                  padding: 4,
                }}
              >
                <UserOutlined />
                <Text style={{ fontSize: 11, fontWeight: 400 }}>Agent: {agentName}</Text>
              </Layout>
            </Tag>
          </Layout>
        }
        style={{
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Layout
          style={{
            background: 'transparent',
            flexGrow: 0,
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {instanceMetadata.user_params?.map((param, index) => {
            const isRequired = instanceMetadata.user_params_metadata?.[param]?.required ?? false;
            const isEmpty = !toolConfiguration.parameters[param];
            const showError = isRequired && isEmpty;
            
            return (
              <Layout
                key={index}
                style={{
                  flexDirection: 'column',
                  flexGrow: 0,
                  background: 'transparent',
                }}
              >
                <Text style={{ fontWeight: 300 }}>
                  {param} {isRequired && <Text type="danger">*</Text>}
                </Text>
                <Password
                  status={showError ? "error" : ""}
                  placeholder={param}
                  value={toolConfiguration.parameters[param]}
                  onChange={(e) => {
                    dispatch(
                      updatedWorkflowToolParameter({
                        workflowId: workflowId,
                        toolInstanceId: toolInstance.id,
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
                  <Text type="danger" style={{ fontSize: '12px' }}>
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

const WorkflowEditorConfigureInputs: React.FC = () => {
  const { data: agents } = useListAgentsQuery({});
  const workflowId = useAppSelector(selectEditorWorkflowId);
  const { data: toolInstances } = useListToolInstancesQuery({});
  const workflowConfiguration = useAppSelector(selectWorkflowConfiguration);
  const workflowGenerationConfig = useAppSelector(selectWorkflowGenerationConfig);
  const dispatch = useAppDispatch();

  // Check if all required parameters are set across all tools
  const hasAllRequiredParams = React.useMemo(() => {
    if (!agents || !toolInstances) return true;

    return agents
      .filter((agent) => agent.workflow_id === workflowId)
      .every((agent) => {
        const toolInstanceIds = agent.tools_id;
        const workflowTools = toolInstances.filter((toolInstance) =>
          toolInstanceIds.includes(toolInstance.id)
        );

        return workflowTools.every((toolInstance) => {
          const metadata: ToolInstanceMetadataProps = JSON.parse(toolInstance.tool_metadata);
          if (!metadata.user_params_metadata) return true;

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

  return (
    <Layout
      style={{
        flexDirection: 'column',
        padding: '16px 24px',
        width: '40%',
        height: '100%',
        background: 'transparent',
        overflow: 'hidden',
        display: 'flex',
        flexShrink: 0,
        flexGrow: 0,
      }}
    >
      <Layout
        style={{
          background: 'transparent',
          width: '100%',
          flexShrink: 0,
          marginBottom: '24px',
        }}
      >
        <Title level={4} style={{ marginBottom: '16px' }}>Agents & Managers</Title>
        <Card title={<Text style={{ fontWeight: 500 }}>Generation</Text>}>
          <Layout
            style={{
              background: 'transparent',
              flexDirection: 'column',
              display: 'flex',
              flexGrow: 0,
              gap: 14,
            }}
          >
            <Layout
              style={{
                background: 'transparent',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  display: 'flex',
                  flexGrow: 0,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: 600 }}>Max New Tokens</Text>
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
                style={{
                  width: 80,
                }}
              />
            </Layout>
            <Layout
              style={{
                background: 'transparent',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  display: 'flex',
                  flexGrow: 0,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: 600 }}>Temperature</Text>
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
                style={{
                  flexGrow: 1,
                  marginLeft: 24,
                }}
              />
            </Layout>
          </Layout>
        </Card>
      </Layout>

      <Layout
        style={{
          background: 'transparent',
          width: '100%',
          flexGrow: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {!hasAllRequiredParams && (
          <Layout
            style={{
              background: 'transparent',
              width: '100%',
              flexShrink: 0,
            }}
          >
            {renderAlert(
              TOOL_PARAMS_ALERT.message,
              TOOL_PARAMS_ALERT.description,
              'warning'
            )}
          </Layout>
        )}

        <Layout
          style={{
            background: 'transparent',
            width: '100%',
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <Title level={4} style={{ marginBottom: '16px' }}>Tools</Title>
          {!hasConfigurableTools && (
            <Alert
              style={{ 
                marginBottom: '16px',
                flexShrink: 0 
              }}
              message={
                <Layout
                  style={{ 
                    flexDirection: 'column', 
                    gap: 4, 
                    padding: 0, 
                    background: 'transparent' 
                  }}
                >
                  <Layout
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      background: 'transparent',
                    }}
                  >
                    <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    <Text style={{ fontSize: 13, fontWeight: 600, background: 'transparent' }}>
                      No Configuration Required
                    </Text>
                  </Layout>
                  <Text style={{ fontSize: 13, fontWeight: 400, background: 'transparent' }}>
                    This workflow has no tools that require configuration. You can proceed to test and
                    deploy the workflow.
                  </Text>
                </Layout>
              }
              type="info"
              showIcon={false}
              closable={false}
            />
          )}
          <Layout 
            style={{ 
              gap: '16px',
              flexGrow: 1,
            }}
          >
            {agents
              ?.filter((agent) => agent.workflow_id === workflowId)
              .map((agent, index) => {
                const toolInstanceIds = agent.tools_id;
                const worklfowTools = toolInstances?.filter((toolInstance) =>
                  toolInstanceIds.includes(toolInstance.id),
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
                  </React.Fragment>
                );
              })}
          </Layout>
        </Layout>
      </Layout>
    </Layout>
  );
};

// Export a flag indicating if all required parameters are set
export const hasValidToolConfiguration = (
  workflowId: string,
  agents: AgentMetadata[] | undefined,
  toolInstances: ToolInstance[] | undefined,
  workflowConfiguration: WorkflowConfiguration
): boolean => {
  console.log('hasValidToolConfiguration called with:', {
    workflowId,
    agentsCount: agents?.length,
    toolInstancesCount: toolInstances?.length,
    workflowConfiguration
  });

  if (!agents || !toolInstances) {
    console.log('No agents or toolInstances, returning true');
    return true;
  }

  const filteredAgents = agents.filter((agent) => agent.workflow_id === workflowId);
  console.log('Filtered agents:', filteredAgents);

  return filteredAgents.every((agent) => {
    const toolInstanceIds = agent.tools_id;
    const workflowTools = toolInstances.filter((toolInstance) =>
      toolInstanceIds.includes(toolInstance.id)
    );
    console.log('Agent tools:', { agentId: agent.id, tools: workflowTools });

    return workflowTools.every((toolInstance) => {
      const metadata: ToolInstanceMetadataProps = JSON.parse(toolInstance.tool_metadata);
      console.log('Tool metadata:', { toolId: toolInstance.id, metadata });

      if (!metadata.user_params_metadata) return true;

      const toolConfig = workflowConfiguration.toolConfigurations[toolInstance.id] || {
        parameters: {},
      };

      const validParams = Object.entries(metadata.user_params_metadata).every(([param, meta]) => {
        if (meta.required) {
          const value = toolConfig.parameters[param];
          const isValid = value !== undefined && value !== '';
          console.log('Parameter validation:', { param, required: true, value, isValid });
          return isValid;
        }
        return true;
      });

      console.log('Tool validation result:', { toolId: toolInstance.id, valid: validParams });
      return validParams;
    });
  });
};

export default WorkflowEditorConfigureInputs;
