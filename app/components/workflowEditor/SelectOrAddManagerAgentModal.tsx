import React, { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  List,
  Layout,
  Typography,
  Form,
  Input,
  Divider,
  Space,
  Tooltip,
  Avatar,
  Select,
} from 'antd';
import { QuestionCircleOutlined, UsergroupAddOutlined, UndoOutlined } from '@ant-design/icons';
import {
  useAddAgentMutation,
  useUpdateAgentMutation,
  useListAgentsQuery,
} from '../../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../../lib/hooks/hooks';
import {
  updatedEditorWorkflowManagerAgentId,
  selectEditorWorkflow,
  updatedEditorWorkflowProcess,
} from '../../workflows/editorSlice';
import { AgentTemplateMetadata, AgentMetadata } from '@/studio/proto/agent_studio';
import { useUpdateWorkflowMutation, useAddWorkflowMutation } from '../../workflows/workflowsApi';
import { createUpdateRequestFromEditor, createAddRequestFromEditor } from '../../lib/workflow';
import { useGlobalNotification } from '../Notifications';
import { useListModelsQuery, useGetModelMutation } from '../../models/modelsApi';
import GenerateAgentPropertiesModal from './GenerateAgentPropertiesModal';

const { Text } = Typography;
const { TextArea } = Input;

const SelectManagerAgentComponent: React.FC<{
  form: any;
  selectedAgentTemplate: AgentTemplateMetadata | null;
  setSelectedAgentTemplate: React.Dispatch<React.SetStateAction<AgentTemplateMetadata | null>>;
  existingManagerAgent: AgentMetadata | null;
  defaultModelId: string;
}> = ({
  form,
  selectedAgentTemplate,
  setSelectedAgentTemplate,
  existingManagerAgent,
  defaultModelId,
}) => {
  const { data: models = [] } = useListModelsQuery({});
  const [isGenerateManagerModalVisible, setIsGenerateManagerModalVisible] = useState(false);
  const [parsedSuggestions, setParsedSuggestions] = useState({ role: '', goal: '', backstory: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [userDescription, setUserDescription] = useState('');

  const handleApplySuggestions = () => {
    form.setFieldsValue({
      name: parsedSuggestions.role,
      role: parsedSuggestions.role,
      goal: parsedSuggestions.goal,
      backstory: parsedSuggestions.backstory,
    });
    setIsGenerateManagerModalVisible(false);
  };

  return (
    <>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
      <Layout
        style={{ display: 'flex', flexDirection: 'row', height: '100%', backgroundColor: '#fff' }}
      >
        <Layout style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}>
          <Typography.Title level={5} style={{ marginBottom: '16px' }}>
            Current Manager Agent
          </Typography.Title>

          <List
            dataSource={existingManagerAgent ? [existingManagerAgent] : []}
            locale={{ emptyText: 'No Custom manager agent.' }}
            renderItem={(agent) => (
              <List.Item>
                <div
                  style={{
                    borderRadius: '4px',
                    border: 'solid 1px #f0f0f0',
                    backgroundColor: '#e6ffe6',
                    width: '100%',
                    height: '160px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}
                  onClick={() => {
                    form.setFieldsValue({
                      name: agent.name,
                      role: agent.crew_ai_agent_metadata?.role || '',
                      backstory: agent.crew_ai_agent_metadata?.backstory || '',
                      goal: agent.crew_ai_agent_metadata?.goal || '',
                    });
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
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <Avatar
                      style={{
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        backgroundColor: 'lightgrey',
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
                      }}
                      title={agent.name}
                    >
                      {agent.name}
                    </Text>
                  </div>
                  <Text
                    style={{
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
                </div>
              </List.Item>
            )}
          />
        </Layout>
        <Divider type="vertical" style={{ height: 'auto', backgroundColor: '#f0f0f0' }} />
        <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}>
          <Typography.Title level={5} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Manager Agent Details</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="default"
                  icon={
                    <img
                      src="/ai-assistant.svg"
                      alt="AI Assistant"
                      style={{
                        filter:
                          'invert(27%) sepia(99%) saturate(1352%) hue-rotate(204deg) brightness(97%) contrast(97%)',
                        width: '20px',
                        height: '20px',
                      }}
                    />
                  }
                  style={{ color: '#0074D2', borderColor: '#0074D2' }}
                  onClick={() => setIsGenerateManagerModalVisible(true)}
                >
                  <span style={{ color: '#0074D2' }}>Generate with AI</span>
                </Button>
                <Button
                  type="default"
                  icon={<UndoOutlined style={{ color: '#0074D2', fontSize: 18, marginRight: 4 }} />}
                  style={{ color: '#0074D2', borderColor: '#0074D2' }}
                  onClick={() => {
                    form.setFieldsValue({
                      name: '',
                      role: '',
                      backstory: '',
                      goal: '',
                    });
                  }}
                >
                  Reset Fields
                </Button>
              </span>
            </div>
          </Typography.Title>
          <Form form={form} layout="vertical">
            <Form.Item
              label={
                <Space>
                  Name
                  <Tooltip title="The name of the manager agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Role
                  <Tooltip title="The role this manager agent plays in the workflow">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="role"
              rules={[{ required: true, message: 'Role is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Backstory
                  <Tooltip title="Background information about this manager agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="backstory"
              rules={[{ required: true, message: 'Backstory is required' }]}
            >
              <TextArea autoSize={{ minRows: 3 }} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  Goal
                  <Tooltip title="The primary objective of this manager agent">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="goal"
              rules={[{ required: true, message: 'Goal is required' }]}
            >
              <TextArea autoSize={{ minRows: 3 }} />
            </Form.Item>
            <Form.Item
              label={
                <Space>
                  LLM Model
                  <Tooltip title="The language model this agent will use">
                    <QuestionCircleOutlined style={{ color: '#666' }} />
                  </Tooltip>
                </Space>
              }
              name="llm_provider_model_id"
              rules={[{ required: true, message: 'Language model is required' }]}
              initialValue={existingManagerAgent?.llm_provider_model_id || defaultModelId}
            >
              <Select>
                {models.map((model) => (
                  <Select.Option key={model.model_id} value={model.model_id}>
                    {model.model_name} {model.model_id === defaultModelId && '(Default)'}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
          <GenerateAgentPropertiesModal
            open={isGenerateManagerModalVisible}
            setOpen={setIsGenerateManagerModalVisible}
            onCancel={() => setIsGenerateManagerModalVisible(false)}
            form={form}
            llmModel={
              models.find(
                (m) =>
                  m.model_id === (form.getFieldValue('llm_provider_model_id') || defaultModelId),
              ) || models[0]
            }
            toolInstances={{}}
          />
        </Layout>
      </Layout>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
    </>
  );
};

interface SelectOrAddManagerAgentModalProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
}

const SelectOrAddManagerAgentModal: React.FC<SelectOrAddManagerAgentModalProps> = ({
  workflowId,
  isOpen,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [addAgent] = useAddAgentMutation();
  const [updateAgent] = useUpdateAgentMutation();
  const [selectedAgentTemplate, setSelectedAgentTemplate] = useState<AgentTemplateMetadata | null>(
    null,
  );
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const { data: agents = [] } = useListAgentsQuery({ workflow_id: workflowId });
  const existingManagerAgent =
    agents.find((agent) => agent.id === workflowState.workflowMetadata.managerAgentId) || null;
  const { data: models = [] } = useListModelsQuery({});
  const [getModel] = useGetModelMutation();
  const [defaultModelId, setDefaultModelId] = useState<string>('');

  useEffect(() => {
    const fetchDefaultModel = async () => {
      if (models && models.length > 0) {
        try {
          // Find the model marked as studio default
          const defaultModel = models.find((model) => model.is_studio_default);
          if (defaultModel) {
            setDefaultModelId(defaultModel.model_id);
          } else {
            // Fallback to first model if no default is set
            const firstModel = await getModel({ model_id: models[0].model_id }).unwrap();
            setDefaultModelId(firstModel.model_id);
          }
        } catch (error) {
          console.error('Error fetching default model:', error);
        }
      }
    };
    fetchDefaultModel();
  }, [models, getModel]);

  useEffect(() => {
    if (isOpen && existingManagerAgent) {
      form.setFieldsValue({
        name: existingManagerAgent.name,
        role: existingManagerAgent.crew_ai_agent_metadata?.role || '',
        backstory: existingManagerAgent.crew_ai_agent_metadata?.backstory || '',
        goal: existingManagerAgent.crew_ai_agent_metadata?.goal || '',
        llm_provider_model_id: existingManagerAgent.llm_provider_model_id || defaultModelId,
      });
    } else if (isOpen) {
      form.setFieldsValue({
        llm_provider_model_id: defaultModelId,
      });
    }
  }, [isOpen, existingManagerAgent, form, defaultModelId]);

  const handleAddManagerAgent = async () => {
    if (existingManagerAgent) {
      notificationApi.error({
        message: 'Manager Agent Exists',
        description: 'Please remove the existing manager agent before creating a new one.',
        placement: 'topRight',
      });
      return;
    }

    try {
      const values = await form.validateFields();

      const newAgent = await addAgent({
        name: values.name,
        template_id: selectedAgentTemplate?.id || '',
        workflow_id: workflowId || '',
        crew_ai_agent_metadata: {
          role: values.role,
          backstory: values.backstory,
          goal: values.goal,
          allow_delegation: true,
          verbose: false,
          cache: false,
          temperature: 0.1,
          max_iter: 0,
        },
        tools_id: [],
        mcp_instance_ids: [],
        llm_provider_model_id: values.llm_provider_model_id,
        tool_template_ids: [],
        tmp_agent_image_path: '',
      }).unwrap();

      dispatch(updatedEditorWorkflowManagerAgentId(newAgent));
      dispatch(updatedEditorWorkflowProcess('hierarchical'));

      const updatedWorkflowState = {
        ...workflowState,
        workflowMetadata: {
          ...workflowState.workflowMetadata,
          managerAgentId: newAgent,
          managerModelId: '',
        },
      };

      if (workflowState.workflowId) {
        await updateWorkflow(createUpdateRequestFromEditor(updatedWorkflowState)).unwrap();
      } else {
        const workflowId = await addWorkflow(
          createAddRequestFromEditor(updatedWorkflowState),
        ).unwrap();
      }

      notificationApi.success({
        message: 'Manager Agent Added',
        description: 'The manager agent has been successfully added to the workflow.',
        placement: 'topRight',
      });
      onClose();
    } catch (error: any) {
      const errorMessage =
        error.data?.error || 'There was an error adding the manager agent. Please try again.';
      notificationApi.error({
        message: 'Error Adding Manager Agent',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  const handleSaveManagerAgent = async () => {
    try {
      const values = await form.validateFields();

      if (existingManagerAgent) {
        // Update existing agent
        await updateAgent({
          agent_id: existingManagerAgent.id,
          name: values.name,
          crew_ai_agent_metadata: {
            role: values.role,
            backstory: values.backstory,
            goal: values.goal,
            allow_delegation: true,
            verbose: false,
            cache: false,
            temperature: 0.1,
            max_iter: 0,
          },
          tools_id: existingManagerAgent.tools_id || [],
          mcp_instance_ids: existingManagerAgent.mcp_instance_ids || [],
          llm_provider_model_id: values.llm_provider_model_id,
          tool_template_ids: [],
          tmp_agent_image_path: '',
        }).unwrap();

        notificationApi.success({
          message: 'Manager Agent Updated',
          description: 'The manager agent has been successfully updated.',
          placement: 'topRight',
        });
        onClose();
      } else {
        await handleAddManagerAgent();
      }
    } catch (error: any) {
      const errorMessage = error.data?.error || 'There was an error. Please try again.';
      notificationApi.error({
        message: 'Error Updating Manager Agent',
        description: errorMessage,
        placement: 'topRight',
      });
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      centered
      title={existingManagerAgent ? 'Edit Manager Agent' : 'Add Manager Agent'}
      width="98%"
      style={{ height: '95vh', padding: '0px' }}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSaveManagerAgent}>
          {existingManagerAgent ? 'Save Manager Agent' : 'Add Manager Agent'}
        </Button>,
      ]}
    >
      <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)' }}>
        <SelectManagerAgentComponent
          form={form}
          selectedAgentTemplate={selectedAgentTemplate}
          setSelectedAgentTemplate={setSelectedAgentTemplate}
          existingManagerAgent={existingManagerAgent}
          defaultModelId={defaultModelId}
        />
      </div>
    </Modal>
  );
};

export default SelectOrAddManagerAgentModal;
