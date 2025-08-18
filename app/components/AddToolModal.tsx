'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  List,
  Layout,
  Typography,
  Button,
  Divider,
  Form,
  Space,
  Tooltip,
  Image,
  Input,
} from 'antd';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { ToolTemplate } from '@/studio/proto/agent_studio';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useGlobalNotification } from '../components/Notifications';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import Editor from '@monaco-editor/react';

interface AddToolModalProps {
  visible: boolean;
  onCancel: () => void;
  onAddTool: (tool: any) => void;
  configuredTools: any[];
}

const { Text } = Typography;
const { TextArea } = Input;

// Removed unused truncateText helper

const AddToolModal: React.FC<AddToolModalProps> = ({
  visible,
  onCancel,
  onAddTool,
  configuredTools,
}) => {
  const { data: toolTemplates = [], isLoading: loadingTemplates } = useListGlobalToolTemplatesQuery(
    {},
  );
  const notificationApi = useGlobalNotification();
  const { imageData } = useImageAssetsData(toolTemplates.map((tool) => tool.tool_image_uri));
  const [selectedToolTemplate, setSelectedToolTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (toolTemplates.length > 0 && !selectedToolTemplate) {
      setSelectedToolTemplate(toolTemplates[0].id);
    }
  }, [toolTemplates, selectedToolTemplate]);

  const handleSelectTool = (tool: ToolTemplate) => {
    const isDuplicate = configuredTools.some((t) => t.toolTemplateId === tool.id);

    if (isDuplicate) {
      notificationApi.error({
        message: 'Duplicate Tool',
        description: 'The selected tool template is already added.',
        placement: 'topRight',
      });
      return;
    }

    setSelectedToolTemplate(tool.id);
  };

  const handleAddTool = () => {
    const tool = toolTemplates.find((t) => t.id === selectedToolTemplate);
    if (!tool) return;

    onAddTool({
      toolTemplateId: tool.id,
      toolTemplateName: tool.name,
      toolTemplateImageURI: tool.tool_image_uri,
      toolDescription: tool.tool_description || 'No description available',
    });
    onCancel();
  };

  const selectedTool = toolTemplates.find((tool) => tool.id === selectedToolTemplate);

  const renderToolTemplate = (item: ToolTemplate) => {
    const isConfigured = configuredTools.some((t) => t.toolTemplateId === item.id);
    return (
      <List.Item>
        <div
          className={`rounded border border-[#f0f0f0] ${
            selectedToolTemplate === item.id ? 'bg-[#e6ffe6]' : 'bg-white'
          } w-full h-[160px] p-4 flex flex-col ${
            isConfigured
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:scale-[1.03] hover:shadow-lg'
          } transition-transform shadow duration-200`}
          onClick={() => !isConfigured && handleSelectTool(item)}
        >
          <div className="flex items-center mb-2">
            {item.tool_image_uri && imageData[item.tool_image_uri] && (
              <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-2">
                <Image
                  src={imageData[item.tool_image_uri]}
                  alt={item.name}
                  width={16}
                  height={16}
                  preview={false}
                  className="rounded-[2px] object-cover"
                />
              </div>
            )}
            <Text
              className="text-sm font-normal whitespace-nowrap overflow-hidden text-ellipsis"
              title={item.name}
            >
              {item.name}
            </Text>
          </div>
          <Text className="text-[11px] text-black/45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
            {item.tool_description || 'N/A'}
          </Text>
        </div>
      </List.Item>
    );
  };

  return (
    <Modal
      title="Select a Tool"
      open={visible}
      onCancel={onCancel}
      width="98%"
      rootClassName="!top-0"
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="add" type="primary" onClick={handleAddTool}>
          Add Tool
        </Button>,
      ]}
    >
      <div className="overflow-y-auto h-[calc(95vh-108px)] relative">
        <Layout className="flex flex-row h-full bg-white">
          <Layout className="flex-1 overflow-y-auto p-4 bg-white">
            <List
              loading={loadingTemplates}
              grid={{ gutter: 16, column: 2 }}
              dataSource={toolTemplates}
              renderItem={renderToolTemplate}
            />
          </Layout>
          <Divider type="vertical" className="h-auto bg-[#f0f0f0]" />
          <Layout className="flex-1 bg-white p-4 overflow-y-auto">
            <Typography.Title level={5} className="mb-2 text-sm">
              Tool Details
            </Typography.Title>
            <Form layout="vertical">
              <Form.Item
                label={
                  <Space>
                    Tool Name
                    <Tooltip title="The name of the tool">
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
              >
                <Input value={selectedTool?.name} readOnly />
              </Form.Item>
              <Form.Item
                label={
                  <Space>
                    Tool Description
                    <Tooltip title="Detailed description of what the tool does">
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
              >
                <TextArea
                  value={selectedTool?.tool_description}
                  readOnly
                  autoSize={{ minRows: 3 }}
                />
              </Form.Item>
              <Form.Item
                label={
                  <Space>
                    tool.py
                    <Tooltip title="The Python code that defines the tool's functionality and interface">
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
              >
                <Editor
                  height="200px"
                  defaultLanguage="python"
                  value={selectedTool?.python_code || 'N/A'}
                  options={{ readOnly: true }}
                  theme="vs-dark"
                />
              </Form.Item>
              <Form.Item
                label={
                  <Space>
                    requirements.txt
                    <Tooltip title="Python package dependencies required by this tool">
                      <QuestionCircleOutlined className="text-[#666]" />
                    </Tooltip>
                  </Space>
                }
              >
                <Editor
                  height="200px"
                  defaultLanguage="plaintext"
                  value={selectedTool?.python_requirements || 'N/A'}
                  options={{ readOnly: true }}
                  theme="vs-dark"
                />
              </Form.Item>
            </Form>
          </Layout>
        </Layout>
      </div>
    </Modal>
  );
};

export default AddToolModal;
