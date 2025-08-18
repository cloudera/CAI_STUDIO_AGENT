import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Input, Typography, message, Collapse, Alert, Tooltip, Upload, Button } from 'antd';
import { Editor } from '@monaco-editor/react';
import { MCPTemplate } from '@/studio/proto/agent_studio';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FileImageOutlined,
  ReloadOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useGlobalNotification } from './Notifications';
import { uploadFile } from '../lib/fileUpload';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface McpTemplateViewProps {
  mcpTemplateDetails: MCPTemplate | undefined;
  mode: 'view' | 'edit';
  onSave?: (updatedFields: Partial<any>) => void;
  onRefresh?: () => void;
  setParentPageMcpName?: (name: string) => void;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  annotations?: any;
}

const McpTemplateView: React.FC<McpTemplateViewProps> = ({
  mcpTemplateDetails,
  mode,
  onSave,
  onRefresh,
  setParentPageMcpName,
}) => {
  const [mcpName, setMcpName] = useState<string>(mcpTemplateDetails?.name || '');
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [isUploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const notificationApi = useGlobalNotification();

  useEffect(() => {
    resetComponentState();
  }, [mcpTemplateDetails, mode]);

  const resetComponentState = () => {
    if (mcpTemplateDetails) {
      setMcpName(mcpTemplateDetails.name || '');
      setParentPageMcpName?.(mcpTemplateDetails.name || '');
    }
    setUploadedFilePath('');
    setSelectedFile(null);
  };

  const parsedTools = useMemo(() => {
    if (!mcpTemplateDetails?.tools) {
      return [];
    }
    try {
      const toolsArray: McpTool[] = JSON.parse(mcpTemplateDetails.tools);
      return toolsArray || [];
    } catch (error) {
      console.error('Failed to parse MCP tools JSON:', error);
      message.error('Failed to display tools: Invalid format provided by MCP.');
      return [];
    }
  }, [mcpTemplateDetails?.tools]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      message.error('Please upload a PNG or JPEG image file');
      return;
    }

    // If file size is greater than 64KB, show a notification
    if (file.size > 64 * 1024) {
      notificationApi.warning({
        message: 'File size should be less than 64KB',
        placement: 'topRight',
      });
      return;
    }

    try {
      const fp = await uploadFile(file, setUploading);

      setUploadedFilePath(fp);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      console.error('Upload failed:', error);
      message.error('Failed to upload file');
    }
  };

  const handleSave = () => {
    onSave?.({
      mcp_template_name: mcpName,
      tmp_mcp_image_path: uploadedFilePath,
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
      resetComponentState();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!mcpTemplateDetails) {
    return <Text>Loading MCP details...</Text>;
  }

  const renderStatusAlert = () => {
    if (mcpTemplateDetails.status === 'VALIDATING') {
      return (
        <Alert
          className="items-start justify-start p-3 mb-4 mt-4"
          message={
            <Layout className="flex-col gap-1 p-0 bg-transparent">
              <Text className="text-[13px] font-normal">
                We're validating the MCP server. Tools made available by the MCP server would be
                visible once the validation succeeds.
              </Text>
            </Layout>
          }
          type="warning"
          showIcon={false}
          closable={false}
        />
      );
    } else if (mcpTemplateDetails.status === 'VALIDATION_FAILED') {
      return (
        <Alert
          className="items-start justify-start p-3 mb-4 mt-4"
          message={
            <Layout className="flex-col gap-1 p-0 bg-transparent">
              <Text className="text-[13px] font-normal">
                We could not figure out the tools offered by the MCP server. But you can still use
                the MCP server in your agentic workflows.
              </Text>
            </Layout>
          }
          type="error"
          showIcon={false}
          closable={false}
        />
      );
    }
    return null;
  };

  const renderStatusIcon = () => {
    return (
      <Tooltip
        title={
          mcpTemplateDetails.status === 'VALID'
            ? 'MCP has been validated'
            : mcpTemplateDetails.status === 'VALIDATING'
              ? 'MCP is being validated'
              : mcpTemplateDetails.status === 'VALIDATION_FAILED'
                ? 'MCP validation failed'
                : 'MCP status unknown'
        }
      >
        {mcpTemplateDetails.status === 'VALID' ? (
          <CheckCircleOutlined className="text-green-500 text-lg ml-2" />
        ) : mcpTemplateDetails.status === 'VALIDATING' ? (
          <ClockCircleOutlined className="text-yellow-500 text-lg ml-2" />
        ) : mcpTemplateDetails.status === 'VALIDATION_FAILED' ? (
          <CloseCircleOutlined className="text-red-500 text-lg ml-2" />
        ) : null}
      </Tooltip>
    );
  };

  return (
    <div className="bg-white overflow-y-auto p-4 relative">
      <div className="flex flex-row bg-white">
        <div className="flex-1 overflow-y-auto pr-4 bg-white">
          <div className="flex flex-col bg-white">
            <div className="flex items-center">
              <Text strong>MCP Server Name</Text>
              {renderStatusIcon()}
            </div>
            <Input
              value={mcpName}
              disabled={mode === 'view'}
              onChange={(e) => {
                setMcpName(e.target.value);
                setParentPageMcpName?.(e.target.value);
              }}
              className={`mt-2 ${mode === 'view' ? 'bg-white cursor-not-allowed text-black' : ''}`}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pl-4 bg-white justify-between">
          {mode === 'edit' && (
            <div className="flex flex-col bg-white pl-4">
              <div className="flex items-center">
                <Text strong>Icon</Text>
              </div>
              <div className="flex flex-row items-center justify-between">
                <div className="flex flex-row items-center">
                  <Upload
                    accept=".png,.jpg,.jpeg"
                    customRequest={({ file, onSuccess, onError }) => {
                      handleFileUpload(file as File)
                        .then(() => onSuccess?.('ok'))
                        .catch((err) => onError?.(err));
                    }}
                    showUploadList={false}
                    disabled={isUploading}
                  >
                    <Button
                      icon={selectedFile ? <FileImageOutlined /> : <UploadOutlined />}
                      loading={isUploading}
                      className="mt-2"
                      disabled={selectedFile !== null}
                    >
                      {selectedFile ? selectedFile.name : 'Upload File'}
                    </Button>
                  </Upload>
                  {selectedFile && (
                    <Button
                      icon={<DeleteOutlined />}
                      className="ml-2 mt-2"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadedFilePath('');
                      }}
                    />
                  )}
                </div>
                <Button
                  icon={isRefreshing ? <SyncOutlined /> : <ReloadOutlined />}
                  type="text"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  size="small"
                  className="mt-2"
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="my-6" />

      <Text strong>Tools Available</Text>
      {renderStatusAlert()}
      {mcpTemplateDetails.status === 'VALID' ? (
        parsedTools.length > 0 ? (
          <Collapse accordion className="mt-2">
            {parsedTools.map((tool, index) => (
              <Panel header={tool.name || `Tool ${index + 1}`} key={`${tool.name}-${index}`}>
                <div className="mb-3">
                  <Text strong>Description:</Text>
                  <Paragraph className="mt-1 mb-0 whitespace-pre-line text-[11px] text-[rgba(0,0,0,0.7)]">
                    {(tool.description || 'No description provided.').trim()}
                  </Paragraph>
                </div>

                <div>
                  <Text strong>Input Schema:</Text>
                  <div className="mt-2 border border-[#d9d9d9] rounded">
                    <Editor
                      height="250px"
                      defaultLanguage="json"
                      value={JSON.stringify(tool.inputSchema, null, 2)}
                      theme="vs-light"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        automaticLayout: true,
                        wordWrap: 'on',
                        scrollbar: {
                          vertical: 'auto',
                          horizontal: 'auto',
                        },
                      }}
                    />
                  </div>
                </div>
              </Panel>
            ))}
          </Collapse>
        ) : (
          <Text className="block mt-2 text-[rgba(0,0,0,0.45)]">
            No tools available for this MCP or tool data is malformed.
          </Text>
        )
      ) : null}

      {/* Save Button - Fixed at bottom right */}
      {mode === 'edit' && (
        <Button
          type="primary"
          onClick={handleSave}
          className="fixed bottom-12 right-12 z-[1000] min-w-[120px] h-10"
        >
          Save
        </Button>
      )}
    </div>
  );
};

export default McpTemplateView;
