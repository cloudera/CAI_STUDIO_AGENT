'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  List,
  Layout,
  Typography,
  notification,
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
import { EditOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons';
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

// Utility function to truncate text to a specified number of words
const truncateText = (text: string, maxWords: number) => {
  const words = text.split(' ');
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}...` : text;
};

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
          style={{
            borderRadius: '4px',
            border: 'solid 1px #f0f0f0',
            backgroundColor: selectedToolTemplate === item.id ? '#e6ffe6' : '#fff',
            width: '100%',
            height: '160px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            cursor: isConfigured ? 'not-allowed' : 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            opacity: isConfigured ? 0.5 : 1,
          }}
          onClick={() => !isConfigured && handleSelectTool(item)}
          onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
            if (!isConfigured) {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            }
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            {item.tool_image_uri && imageData[item.tool_image_uri] && (
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
                <Image
                  src={imageData[item.tool_image_uri]}
                  alt={item.name}
                  width={16}
                  height={16}
                  preview={false}
                  style={{ borderRadius: '2px', objectFit: 'cover' }}
                />
              </div>
            )}
            <Text
              style={{
                fontSize: '14px',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={item.name}
            >
              {item.name}
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
      style={{ height: '95vh', top: 0 }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="add" type="primary" onClick={handleAddTool}>
          Add Tool
        </Button>,
      ]}
    >
      <div style={{ overflowY: 'auto', height: 'calc(95vh - 108px)', position: 'relative' }}>
        <Layout
          style={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            backgroundColor: '#fff',
          }}
        >
          <Layout style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#fff' }}>
            <List
              loading={loadingTemplates}
              grid={{ gutter: 16, column: 2 }}
              dataSource={toolTemplates}
              renderItem={renderToolTemplate}
            />
          </Layout>
          <Divider type="vertical" style={{ height: 'auto', backgroundColor: '#f0f0f0' }} />
          <Layout style={{ flex: 1, backgroundColor: '#fff', padding: '16px', overflowY: 'auto' }}>
            <Typography.Title level={5} style={{ marginBottom: '8px', fontSize: '14px' }}>
              Tool Details
            </Typography.Title>
            <Form layout="vertical">
              <Form.Item
                label={
                  <Space>
                    Tool Name
                    <Tooltip title="The name of the tool">
                      <QuestionCircleOutlined style={{ color: '#666' }} />
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
                      <QuestionCircleOutlined style={{ color: '#666' }} />
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
                      <QuestionCircleOutlined style={{ color: '#666' }} />
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
                      <QuestionCircleOutlined style={{ color: '#666' }} />
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
