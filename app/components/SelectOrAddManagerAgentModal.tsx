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
  Alert,
} from 'antd';
import { PlusOutlined, QuestionCircleOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import {
  useListGlobalAgentTemplatesQuery,
  useAddAgentMutation,
  useUpdateAgentMutation,
  useListAgentsQuery,
} from '../agents/agentApi';
import { useAppDispatch, useAppSelector } from '../lib/hooks/hooks';
import {
  selectEditorWorkflowId,
  updatedEditorWorkflowManagerAgentId,
  selectEditorWorkflow,
  updatedEditorWorkflowProcess,
} from '../workflows/editorSlice';
import { AgentTemplateMetadata, AgentMetadata } from '@/studio/proto/agent_studio';
import { useUpdateWorkflowMutation, useAddWorkflowMutation } from '../workflows/workflowsApi';
import { createUpdateRequestFromEditor, createAddRequestFromEditor } from '../lib/workflow';
import { useGlobalNotification } from './Notifications';

const { Text } = Typography;
const { TextArea } = Input;

const SelectManagerAgentComponent: React.FC<{
  form: any;
  selectedAgentTemplate: AgentTemplateMetadata | null;
  setSelectedAgentTemplate: React.Dispatch<React.SetStateAction<AgentTemplateMetadata | null>>;
  existingManagerAgent: AgentMetadata | null;
}> = ({ form, selectedAgentTemplate, setSelectedAgentTemplate, existingManagerAgent }) => {
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
            Manager Agent Details
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
          </Form>
        </Layout>
      </Layout>
      <Divider style={{ margin: 0, backgroundColor: '#f0f0f0' }} />
    </>
  );
};

interface SelectOrAddManagerAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SelectOrAddManagerAgentModal: React.FC<SelectOrAddManagerAgentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [addAgent] = useAddAgentMutation();
  const [updateAgent] = useUpdateAgentMutation();
  const workflowId = useAppSelector(selectEditorWorkflowId);
  const [selectedAgentTemplate, setSelectedAgentTemplate] = useState<AgentTemplateMetadata | null>(
    null,
  );
  const [updateWorkflow] = useUpdateWorkflowMutation();
  const [addWorkflow] = useAddWorkflowMutation();
  const workflowState = useAppSelector(selectEditorWorkflow);
  const notificationApi = useGlobalNotification();
  const { data: agents = [] } = useListAgentsQuery({});
  const existingManagerAgent =
    agents.find((agent) => agent.id === workflowState.workflowMetadata.managerAgentId) || null;

  useEffect(() => {
    if (!isOpen) {
      setSelectedAgentTemplate(null);
      form.resetFields();
    }
  }, [isOpen, form]);

  useEffect(() => {
    if (isOpen && existingManagerAgent) {
      form.setFieldsValue({
        name: existingManagerAgent.name,
        role: existingManagerAgent.crew_ai_agent_metadata?.role || '',
        backstory: existingManagerAgent.crew_ai_agent_metadata?.backstory || '',
        goal: existingManagerAgent.crew_ai_agent_metadata?.goal || '',
      });
    }
  }, [isOpen, existingManagerAgent, form]);

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
        llm_provider_model_id: '',
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
          llm_provider_model_id: '',
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
        />
      </div>
    </Modal>
  );
};

export default SelectOrAddManagerAgentModal;
