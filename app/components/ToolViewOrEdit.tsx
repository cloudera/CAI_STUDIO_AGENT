import React, { useEffect, useState } from 'react';
import { Layout, Button, Input, Typography, message, Upload, Tooltip } from 'antd';
import {
  ExportOutlined,
  ReloadOutlined,
  UploadOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  FileImageOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Editor } from '@monaco-editor/react';
import { ToolTemplate } from '@/studio/proto/agent_studio';
import { uploadFile } from '../lib/fileUpload';
import { useGetParentProjectDetailsQuery } from '../lib/crossCuttingApi';
import { useGlobalNotification } from '../components/Notifications';

const { TextArea } = Input;
const { Text } = Typography;

interface ToolViewOrEditProps {
  mode: 'view' | 'edit';
  toolDetails: ToolTemplate | null;
  onSave: (updatedFields: Partial<any>) => void;
  onRefresh?: () => void;
  setParentPageToolName?: (name: string) => void;
}

const ToolViewOrEdit: React.FC<ToolViewOrEditProps> = ({
  mode,
  toolDetails,
  onSave,
  onRefresh,
  setParentPageToolName,
}) => {
  const [toolName, setToolName] = useState<string>(toolDetails?.name || '');
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [isUploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: parentProjectDetails } = useGetParentProjectDetailsQuery({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const notificationApi = useGlobalNotification();

  useEffect(() => {
    if (toolDetails) {
      setToolName(toolDetails.name || '');
    }
  }, [toolDetails]);

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
    onSave({
      tool_template_name: toolName,
      tmp_tool_image_path: uploadedFilePath, // Include the uploaded file path
    });
  };

  const handleEditToolFile = () => {
    if (toolDetails?.source_folder_path && parentProjectDetails?.project_base) {
      const fileUrl = new URL(
        `files/${parentProjectDetails?.studio_subdirectory && parentProjectDetails?.studio_subdirectory.length > 0 ? parentProjectDetails?.studio_subdirectory + '/' : ''}${toolDetails.source_folder_path}/`,
        parentProjectDetails.project_base,
      );
      window.open(fileUrl, '_blank');
    } else {
      message.error('File path or project base URL is not available.');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Layout
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Left Side: Tool Details */}
      <Layout
        style={{
          flex: 1,
          borderRight: '1px solid #f0f0f0',
          background: '#fff',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
        }}
      >
        {/* Tool Name */}
        <Text strong>Tool Name</Text>
        <Input
          value={toolName}
          onChange={(e) => {
            setToolName(e.target.value);
            setParentPageToolName?.(e.target.value);
          }}
          disabled={mode === 'view'}
          style={{
            marginTop: '8px',
            backgroundColor: mode === 'view' ? '#fff' : undefined,
            cursor: mode === 'view' ? 'not-allowed' : 'text',
            color: mode === 'view' ? '#000' : undefined,
          }}
        />
        <div style={{ margin: '16px 0' }} />

        {/* Tool Description */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Text strong>Tool Description</Text>
          <Tooltip title="The tool description is fetched from the tool class definition in tool.py file.">
            <QuestionCircleOutlined style={{ marginLeft: 8, cursor: 'pointer' }} />
          </Tooltip>
        </div>
        <TextArea
          rows={4}
          value={toolDetails?.tool_description}
          disabled
          style={{
            marginTop: '8px',
            backgroundColor: mode === 'view' ? '#fff' : undefined,
            cursor: mode === 'view' ? 'not-allowed' : 'text',
            color: mode === 'view' ? '#000' : undefined,
          }}
        />
        <div style={{ margin: '16px 0' }} />

        {/* Validation Errors (if any) */}
        {toolDetails?.tool_metadata &&
          (() => {
            try {
              const validation_errors: string[] = JSON.parse(
                toolDetails.tool_metadata,
              ).validation_errors;
              if (validation_errors.length > 0) {
                return (
                  <>
                    <Text strong>Validation Errors</Text>
                    <div
                      style={{
                        background: '#ffccc7',
                        padding: '12px',
                        borderRadius: '4px',
                        marginTop: '8px',
                      }}
                    >
                      {validation_errors.map((error, index) => (
                        <div key={index} style={{ display: 'flex', marginBottom: '4px' }}>
                          <span style={{ marginRight: '8px' }}>•</span>
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ margin: '16px 0' }} />
                  </>
                );
              } else {
                return null;
              }
            } catch (e) {
              console.error('Failed to parse tool metadata:', e);
            }
            return null;
          })()}

        {/* Upload Tool Icon */}
        {mode === 'edit' && (
          <>
            <Text strong>Tool Icon</Text>
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
            <div style={{ margin: '16px 0' }} />
          </>
        )}

        {/* Save Button */}
        {mode === 'edit' && (
          <Button type="primary" block onClick={handleSave} style={{ marginTop: 'auto' }}>
            Save
          </Button>
        )}
      </Layout>

      {/* Right Side: Placeholder for Workflow Diagram */}
      <Layout style={{ flex: 1, overflow: 'hidden', background: '#fafafa' }}>
        {/* Tool Template Edit and Refresh Button */}
        {/* Buttons Row */}
        {/* Buttons in a Single Row */}
        {/* Tool Template Details */}
        {toolDetails && (
          <Layout style={{ flex: 1, background: '#fff', padding: '16px', borderRadius: '8px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '12px',
                marginBottom: '12px',
              }}
            >
              {!toolDetails?.pre_built ? (
                <Button type="text" onClick={handleEditToolFile} size="small">
                  Edit Tool File <ExportOutlined />
                </Button>
              ) : (
                <div></div>
              )}
              <Button
                icon={isRefreshing ? <SyncOutlined /> : <ReloadOutlined />}
                type="text"
                onClick={handleRefresh}
                disabled={isRefreshing}
                size="small"
              >
                Refresh
              </Button>
            </div>
            <Typography style={{ fontSize: 13, fontWeight: 400, marginBottom: '8px' }}>
              tool.py
            </Typography>
            <Editor
              height="800px"
              defaultLanguage="python"
              value={toolDetails.python_code}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
              }}
            />

            <Typography
              style={{
                fontSize: 13,
                fontWeight: 400,
                marginTop: '16px',
                marginBottom: '8px',
              }}
            >
              requirements.txt
            </Typography>
            <Editor
              height="150px"
              defaultLanguage="plaintext"
              value={toolDetails.python_requirements}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
              }}
            />
          </Layout>
        )}
      </Layout>
    </Layout>
  );
};

export default ToolViewOrEdit;
