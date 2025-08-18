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
}> = ({ form, existingManagerAgent, defaultModelId }) => {
  const { data: models = [] } = useListModelsQuery({});
  const [isGenerateManagerModalVisible, setIsGenerateManagerModalVisible] = useState(false);

  return (
    <>
      <Divider className="m-0 bg-gray-200" />
      <Layout className="flex flex-row h-full bg-white">
        <Layout className="flex-1 overflow-y-auto p-4 bg-white">
          <Typography.Title level={5} className="mb-4">
            Current Manager Agent
          </Typography.Title>

          <List
            dataSource={existingManagerAgent ? [existingManagerAgent] : []}
            locale={{ emptyText: 'No Custom manager agent.' }}
            renderItem={(agent) => (
              <List.Item>
                <div
                  className="rounded border border-[#f0f0f0] bg-[#e6ffe6] w-full h-[160px] p-4 flex flex-col cursor-pointer shadow hover:shadow-lg hover:scale-[1.03] transition-transform"
                  onClick={() => {
                    form.setFieldsValue({
                      name: agent.name,
                      role: agent.crew_ai_agent_metadata?.role || '',
                      backstory: agent.crew_ai_agent_metadata?.backstory || '',
                      goal: agent.crew_ai_agent_metadata?.goal || '',
                    });
                  }}
                >
                  <div className="flex flex-row items-center gap-3 mb-4">
                    <Avatar
                      className="shadow bg-gray-300"
                      size={24}
                      icon={<UsergroupAddOutlined />}
                    />
                    <Text
                      className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                      title={agent.name}
                    >
                      {agent.name}
                    </Text>
                  </div>
                  <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                    Goal:{' '}
                    <span className="text-black font-normal">
                      {agent.crew_ai_agent_metadata?.goal || 'N/A'}
                    </span>
                  </Text>
                  <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis mt-2">
                    Backstory:{' '}
                    <span className="text-black font-normal">
                      {agent.crew_ai_agent_metadata?.backstory || 'N/A'}
                    </span>
                  </Text>
                </div>
              </List.Item>
            )}
          />
        </Layout>
        <Divider type="vertical" className="h-auto bg-[#f0f0f0]" />
        <Layout className="flex-1 bg-white p-4 overflow-y-auto">
          <Typography.Title level={5} className="mb-4">
            <div className="flex items-center justify-between">
              <span>Manager Agent Details</span>
              <span className="flex items-center gap-2">
                <Button
                  type="default"
                  icon={<img src="/ai-assistant.svg" alt="AI Assistant" className="w-5 h-5" />}
                  className="text-[#0074D2] border-[#0074D2]"
                  onClick={() => setIsGenerateManagerModalVisible(true)}
                >
                  <span className="text-[#0074D2]">Generate with AI</span>
                </Button>
                <Button
                  type="default"
                  icon={<UndoOutlined className="text-[#0074D2] text-[18px] mr-1" />}
                  className="text-[#0074D2] border-[#0074D2]"
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
                    <QuestionCircleOutlined className="text-[#666]" />
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
                    <QuestionCircleOutlined className="text-[#666]" />
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
                    <QuestionCircleOutlined className="text-[#666]" />
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
                    <QuestionCircleOutlined className="text-[#666]" />
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
                    <QuestionCircleOutlined className="text-[#666]" />
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
      <Divider className="m-0 bg-gray-200" />
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
        const _workflowId = await addWorkflow(
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
      className="w-[98%]"
      rootClassName="!top-0"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSaveManagerAgent}>
          {existingManagerAgent ? 'Save Manager Agent' : 'Add Manager Agent'}
        </Button>,
      ]}
    >
      <div className="overflow-y-auto h-[calc(95vh-108px)]">
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
