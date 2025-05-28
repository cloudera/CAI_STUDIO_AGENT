'use client';

import React, { useEffect, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Layout,
  Alert,
  Table,
  Select,
  notification,
  List,
  Image,
  Typography,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  useAddAgentTemplateMutation,
  useGetAgentTemplateQuery,
  useUpdateAgentTemplateMutation,
} from '@/app/agents/agentApi';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import CommonBreadCrumb from './CommonBreadCrumb';
import AddToolModal from './AddToolModal';
import { useGlobalNotification } from '../components/Notifications';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';

const { Content, Footer } = Layout;
const { TextArea } = Input;
const { Text } = Typography;

interface ConfiguredTool {
  toolTemplateId: string;
  toolTemplateName: string;
  toolTemplateImageURI?: string;
  toolDescription?: string;
}

const AgentTemplateForm = ({ agentTemplateId }: { agentTemplateId?: string }) => {
  const [form] = Form.useForm();
  const router = useRouter();
  const [configuredTools, setConfiguredTools] = useState<ConfiguredTool[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const notificationApi = useGlobalNotification();
  const [isAddToolModalVisible, setAddToolModalVisible] = useState(false);

  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const [addAgentTemplate] = useAddAgentTemplateMutation();
  const [updateAgentTemplate] = useUpdateAgentTemplateMutation();

  const { data: agentTemplateData, isLoading: agentTemplateLoading } = useGetAgentTemplateQuery(
    { id: agentTemplateId || '' },
    { skip: !agentTemplateId },
  );

  const { imageData: toolIconsData } = useImageAssetsData(
    configuredTools.map((tool) => tool.toolTemplateImageURI),
  );

  const showNotification = (
    type: 'success' | 'error' | 'info',
    message: string,
    description: string,
  ) => {
    notificationApi[type]({
      message,
      description,
      placement: 'topRight',
    });
  };

  useEffect(() => {
    if (agentTemplateData && agentTemplateId) {
      form.setFieldsValue({
        name: agentTemplateData.name,
        role: agentTemplateData.role,
        backstory: agentTemplateData.backstory,
        goal: agentTemplateData.goal,
      });

      const tools = agentTemplateData.tool_template_ids.map((toolTemplateId: string) => {
        const toolTemplate = toolTemplates.find((t) => t.id === toolTemplateId);
        return {
          toolTemplateId,
          toolTemplateName: toolTemplate?.name || `Tool ${toolTemplateId}`,
          toolTemplateImageURI: toolTemplate?.tool_image_uri,
          toolDescription: toolTemplate?.tool_description || 'No description available',
        };
      });

      setConfiguredTools(tools);
    }
  }, [agentTemplateData, agentTemplateId, form, toolTemplates]);

  const handleAddTool = (toolTemplateId: string) => {
    const toolTemplate = toolTemplates.find((t) => t.id === toolTemplateId);

    if (!toolTemplate) {
      showNotification('error', 'Invalid Tool', 'The selected tool template does not exist.');
      return;
    }

    const isDuplicate = configuredTools.some((t) => t.toolTemplateId === toolTemplateId);
    if (isDuplicate) {
      showNotification('error', 'Duplicate Tool', 'The selected tool template is already added.');
      return;
    }

    setConfiguredTools((prev) => [
      ...prev,
      {
        toolTemplateId,
        toolTemplateName: toolTemplate.name,
        toolTemplateImageURI: toolTemplate.tool_image_uri,
        toolDescription: toolTemplate.tool_description || 'No description available',
      },
    ]);
  };

  const handleDeleteTool = (toolTemplateId: string) => {
    setConfiguredTools((prev) => prev.filter((tool) => tool.toolTemplateId !== toolTemplateId));
    showNotification('success', 'Tool Removed', 'Tool removed successfully.');
  };

  const handleViewToolDetails = (toolTemplateId: string) => {
    // Implement tool details view logic here
    console.log('View details for tool:', toolTemplateId);
  };

  const handleFormSubmit = async (values: any) => {
    try {
      setLoading(true);
      const payload = {
        name: values.name,
        role: values.role,
        backstory: values.backstory,
        goal: values.goal,
        tool_template_ids: configuredTools.map((tool) => tool.toolTemplateId),
        description: values.description || 'No description provided',
        allow_delegation: false,
        verbose: false,
        cache: false,
        temperature: 0.1,
        max_iter: 10,
        tmp_agent_image_path: '',
      };

      if (agentTemplateId) {
        await updateAgentTemplate({ agent_template_id: agentTemplateId, ...payload }).unwrap();
        showNotification(
          'success',
          'Agent Template Updated',
          'Agent template updated successfully!',
        );
      } else {
        await addAgentTemplate(payload).unwrap();
        showNotification(
          'success',
          'Agent Template Created',
          'Agent template created successfully!',
        );
      }

      router.push('/agents');
    } catch (error: any) {
      console.error('Error occurred during API call:', error);
      setSubmitError(error?.data?.error || 'An error occurred while saving the agent template.');
      showNotification(
        'error',
        'Error Saving Agent Template',
        error?.data?.error || 'An error occurred.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddToolFromModal = (tool: ConfiguredTool) => {
    const toolTemplate = toolTemplates.find((t) => t.id === tool.toolTemplateId);

    setConfiguredTools((prev) => [
      ...prev,
      {
        ...tool,
        toolTemplateImageURI: toolTemplate?.tool_image_uri,
        toolDescription: toolTemplate?.tool_description || 'No description available',
      },
    ]);
  };

  const toolColumns = [
    {
      title: '',
      dataIndex: 'toolTemplateImageURI',
      key: 'toolTemplateImageURI',
      render: (imagePath: string) => (
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#f1f1f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imagePath && toolIconsData[imagePath] && (
            <img
              src={toolIconsData[imagePath]}
              alt="Tool"
              style={{
                width: '16px',
                height: '16px',
                objectFit: 'cover',
                borderRadius: '2px',
              }}
            />
          )}
        </div>
      ),
    },
    {
      title: 'Tool',
      dataIndex: 'toolTemplateName',
      key: 'toolTemplateName',
    },
    {
      title: 'Description',
      dataIndex: 'toolDescription',
      key: 'toolDescription',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: ConfiguredTool) => (
        <Button
          type="link"
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteTool(record.toolTemplateId)}
        />
      ),
      width: 80,
    },
  ];

  return (
    <Layout style={{ flex: 1, padding: '16px 24px 22px', flexDirection: 'column' }}>
      <Content
        style={{
          padding: '16px',
          margin: '0 auto',
          overflowY: 'auto',
          flex: 1,
          width: '60%',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          marginBottom: '80px',
        }}
      >
        {submitError && (
          <Alert
            message="Error"
            description={submitError}
            type="error"
            showIcon
            closable
            onClose={() => setSubmitError(null)}
            style={{ marginBottom: '10px' }}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          initialValues={{
            name: '',
            tools_id: [],
            role: '',
            backstory: '',
            goal: '',
          }}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Agent template name is required.' }]}
          >
            <Input
              placeholder="Enter agent template name"
              disabled={loading || agentTemplateLoading}
            />
          </Form.Item>
          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: 'Role is required.' }]}
          >
            <Input
              placeholder="Enter agent template role"
              disabled={loading || agentTemplateLoading}
            />
          </Form.Item>
          <Form.Item
            label="Backstory"
            name="backstory"
            rules={[{ required: true, message: 'Backstory is required.' }]}
          >
            <TextArea
              placeholder="Enter agent template backstory"
              autoSize={{ minRows: 3 }}
              disabled={loading || agentTemplateLoading}
            />
          </Form.Item>
          <Form.Item
            label="Goal"
            name="goal"
            rules={[{ required: true, message: 'Goal is required.' }]}
          >
            <TextArea
              placeholder="Enter agent template goal"
              autoSize={{ minRows: 3 }}
              disabled={loading || agentTemplateLoading}
            />
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <Button
              type="dashed"
              onClick={() => setAddToolModalVisible(true)}
              style={{ width: '100%' }}
            >
              + Add Tool
            </Button>
          </Form.Item>
          {configuredTools.length > 0 && (
            <List
              grid={{ gutter: 16, column: 2 }}
              dataSource={configuredTools.map((tool) => ({
                key: tool.toolTemplateId,
                toolTemplateImageURI: tool.toolTemplateImageURI,
                toolDescription: tool.toolDescription,
                ...tool,
              }))}
              style={{ marginTop: '16px' }}
              renderItem={(tool) => (
                <List.Item>
                  <div
                    style={{
                      borderRadius: '4px',
                      border: 'solid 1px #f0f0f0',
                      backgroundColor: '#fff',
                      width: '100%',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: '#f1f1f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: '8px',
                          }}
                        >
                          {tool.toolTemplateImageURI && (
                            <Image
                              src={tool.toolTemplateImageURI}
                              alt={tool.toolTemplateName}
                              width={16}
                              height={16}
                              preview={false}
                              style={{
                                borderRadius: '2px',
                                objectFit: 'cover',
                              }}
                            />
                          )}
                        </div>
                        <Text
                          style={{
                            fontSize: '14px',
                            fontWeight: 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={tool.toolTemplateName}
                        >
                          {tool.toolTemplateName}
                        </Text>
                      </div>
                      <Button
                        type="link"
                        icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTool(tool.toolTemplateId);
                        }}
                      />
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
                      {tool.toolDescription}
                    </Text>
                    <div style={{ marginTop: 'auto' }}>
                      <Button
                        type="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewToolDetails(tool.toolTemplateId);
                        }}
                        style={{ paddingLeft: 0 }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Form>
      </Content>
      <Footer
        style={{
          position: 'fixed',
          bottom: '0',
          width: '100%',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          textAlign: 'right',
          padding: '10px 24px',
        }}
      >
        <Button
          onClick={() => router.push('/agents')}
          style={{ marginRight: 8 }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="primary" onClick={() => form.submit()} loading={loading}>
          {agentTemplateId ? 'Save Changes' : 'Create Agent Template'}
        </Button>
      </Footer>
      <AddToolModal
        visible={isAddToolModalVisible}
        onCancel={() => setAddToolModalVisible(false)}
        onAddTool={handleAddToolFromModal}
        configuredTools={configuredTools}
      />
    </Layout>
  );
};

export default AgentTemplateForm;
