'use client';

import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Layout, Alert, List, Image, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  useAddAgentTemplateMutation,
  useGetAgentTemplateQuery,
  useUpdateAgentTemplateMutation,
} from '@/app/agents/agentApi';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
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

  const handleDeleteTool = (toolTemplateId: string) => {
    setConfiguredTools((prev) => prev.filter((tool) => tool.toolTemplateId !== toolTemplateId));
    showNotification('success', 'Tool Removed', 'Tool removed successfully.');
  };

  const handleViewToolDetails = (_toolTemplateId: string) => {
    // Implement tool details view logic here
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

  const _toolColumns = [
    {
      title: '',
      dataIndex: 'toolTemplateImageURI',
      key: 'toolTemplateImageURI',
      render: (imagePath: string) => (
        <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center">
          {imagePath && toolIconsData[imagePath] && (
            <img
              src={toolIconsData[imagePath]}
              alt="Tool"
              className="w-4 h-4 object-cover rounded-sm"
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
    <Layout className="flex-1 px-6 pt-4 pb-[22px] flex flex-col">
      <Content className="p-4 mx-auto overflow-y-auto flex-1 w-[60%] bg-white shadow">
        {submitError && (
          <Alert
            message="Error"
            description={submitError}
            type="error"
            showIcon
            closable
            onClose={() => setSubmitError(null)}
            className="mb-[10px]"
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
            <Button type="dashed" onClick={() => setAddToolModalVisible(true)} className="w-full">
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
              className="mt-4"
              renderItem={(tool) => (
                <List.Item>
                  <div className="rounded border border-[#f0f0f0] bg-white w-full p-4 flex flex-col cursor-pointer transition-transform duration-200 ease-in-out shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-2">
                          {tool.toolTemplateImageURI && (
                            <Image
                              width={16}
                              height={16}
                              preview={false}
                              className="rounded-sm object-cover"
                            />
                          )}
                        </div>
                        <Text
                          className="text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                          title={tool.toolTemplateName}
                        >
                          {tool.toolTemplateName}
                        </Text>
                      </div>
                      <Button
                        type="link"
                        icon={<DeleteOutlined className="text-[#ff4d4f]" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTool(tool.toolTemplateId);
                        }}
                      />
                    </div>
                    <Text className="text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                      {tool.toolDescription}
                    </Text>
                    <div className="mt-auto">
                      <Button
                        type="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewToolDetails(tool.toolTemplateId);
                        }}
                        className="pl-0"
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
      <Footer className="fixed bottom-0 w-full bg-white border-t border-[#f0f0f0] text-right py-[10px] px-6">
        <Button onClick={() => router.push('/agents')} className="mr-2" disabled={loading}>
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
