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
      console.log('File uploaded to:', fp);
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
          style={{
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: 12,
            marginBottom: 16,
            marginTop: 16,
          }}
          message={
            <Layout
              style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
            >
              <Text style={{ fontSize: 13, fontWeight: 400 }}>
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
          style={{
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: 12,
            marginBottom: 16,
            marginTop: 16,
          }}
          message={
            <Layout
              style={{ flexDirection: 'column', gap: 4, padding: 0, background: 'transparent' }}
            >
              <Text style={{ fontSize: 13, fontWeight: 400 }}>
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
          <CheckCircleOutlined
            style={{
              color: '#52c41a',
              fontSize: '16px',
              marginLeft: '8px',
            }}
          />
        ) : mcpTemplateDetails.status === 'VALIDATING' ? (
          <ClockCircleOutlined
            style={{
              color: '#faad14',
              fontSize: '16px',
              marginLeft: '8px',
            }}
          />
        ) : mcpTemplateDetails.status === 'VALIDATION_FAILED' ? (
          <CloseCircleOutlined
            style={{
              color: '#f5222d',
              fontSize: '16px',
              marginLeft: '8px',
            }}
          />
        ) : null}
      </Tooltip>
    );
  };

  return (
    <div
      style={{
        background: '#fff',
        overflowY: 'auto',
        padding: '16px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#fff',
        }}
      >
        <div
          style={{ flex: 0.5, overflowY: 'auto', paddingRight: '16px', backgroundColor: '#fff' }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
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
              style={{
                marginTop: '8px',
                backgroundColor: mode === 'view' ? '#fff' : undefined,
                cursor: mode === 'view' ? 'not-allowed' : 'text',
                color: mode === 'view' ? 'rgba(0, 0, 0, 0.88)' : undefined,
              }}
            />
          </div>
        </div>
        <div
          style={{
            flex: 0.5,
            overflowY: 'auto',
            paddingLeft: '16px',
            backgroundColor: '#fff',
            justifyContent: 'space-between',
          }}
        >
          {mode === 'edit' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#fff',
                paddingLeft: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Text strong>Icon</Text>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
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
                      style={{ marginTop: '8px' }}
                      disabled={selectedFile !== null}
                    >
                      {selectedFile ? selectedFile.name : 'Upload File'}
                    </Button>
                  </Upload>
                  {selectedFile && (
                    <Button
                      icon={<DeleteOutlined />}
                      style={{ marginLeft: '8px', marginTop: '8px' }}
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
                  style={{ marginTop: '8px' }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: '24px 0 16px 0' }} />

      <Text strong>Tools Available</Text>
      {renderStatusAlert()}
      {mcpTemplateDetails.status === 'VALID' ? (
        parsedTools.length > 0 ? (
          <Collapse accordion style={{ marginTop: '8px' }}>
            {parsedTools.map((tool, index) => (
              <Panel header={tool.name || `Tool ${index + 1}`} key={`${tool.name}-${index}`}>
                <div style={{ marginBottom: '12px' }}>
                  <Text strong>Description:</Text>
                  <Paragraph
                    style={{
                      marginTop: '4px',
                      marginBottom: 0,
                      whiteSpace: 'pre-line',
                      color: 'rgba(0, 0, 0, 0.7)',
                      fontSize: '11px',
                    }}
                  >
                    {(tool.description || 'No description provided.').trim()}
                  </Paragraph>
                </div>

                <div>
                  <Text strong>Input Schema:</Text>
                  <div
                    style={{ marginTop: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                  >
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
          <Text style={{ display: 'block', marginTop: '8px', color: 'rgba(0, 0, 0, 0.45)' }}>
            No tools available for this MCP or tool data is malformed.
          </Text>
        )
      ) : null}

      {/* Save Button - Fixed at bottom right */}
      {mode === 'edit' && (
        <Button
          type="primary"
          onClick={handleSave}
          style={{
            position: 'fixed',
            bottom: '48px',
            right: '48px',
            zIndex: 1000,
            minWidth: '120px',
            height: '40px',
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
};

export default McpTemplateView;
