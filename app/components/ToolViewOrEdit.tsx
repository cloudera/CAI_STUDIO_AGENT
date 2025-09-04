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
  saving?: boolean;
}

const ToolViewOrEdit: React.FC<ToolViewOrEditProps> = ({
  mode,
  toolDetails,
  onSave,
  onRefresh,
  setParentPageToolName,
  saving = false,
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
    if (!file) {
      return;
    }

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
    <Layout className="flex flex-row w-full h-screen overflow-hidden">
      {/* Left Side: Tool Details */}
      <Layout className="flex-1 border-r border-solid border-[#f0f0f0] bg-white overflow-y-auto overflow-x-hidden p-4">
        {/* Tool Name */}
        <Text strong>Tool Name</Text>
        <Input
          value={toolName}
          onChange={(e) => {
            setToolName(e.target.value);
            setParentPageToolName?.(e.target.value);
          }}
          disabled={mode === 'view'}
          className={mode === 'view' ? 'mt-2 bg-white cursor-not-allowed text-black' : 'mt-2'}
        />
        <div className="my-4" />

        {/* Tool Description */}
        <div className="flex items-center">
          <Text strong>Tool Description</Text>
          <Tooltip title="The tool description is fetched from the tool class definition in tool.py file.">
            <QuestionCircleOutlined className="ml-2 cursor-pointer" />
          </Tooltip>
        </div>
        <TextArea
          rows={4}
          value={toolDetails?.tool_description}
          disabled
          className={mode === 'view' ? 'mt-2 bg-white cursor-not-allowed text-black' : 'mt-2'}
        />
        <div className="my-4" />

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
                    <div className="bg-[#ffccc7] p-3 rounded mt-2">
                      {validation_errors.map((error, index) => (
                        <div key={index} className="flex mb-1">
                          <span className="mr-2">•</span>
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                    <div className="my-4" />
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
            <div className="my-4" />
          </>
        )}

        {/* Save Button */}
        {mode === 'edit' && (
          <Button
            type="primary"
            block
            onClick={handleSave}
            className="mt-auto"
            loading={saving}
            disabled={saving}
          >
            Save
          </Button>
        )}
      </Layout>

      {/* Right Side: Placeholder for Workflow Diagram */}
      <Layout className="flex-1 overflow-hidden bg-[#fafafa]">
        {/* Tool Template Edit and Refresh Button */}
        {/* Buttons Row */}
        {/* Buttons in a Single Row */}
        {/* Tool Template Details */}
        {toolDetails && (
          <Layout className="flex-1 bg-white p-4 rounded">
            <div className="flex justify-between mt-3 mb-3">
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
            <Typography className="text-sm font-normal mb-2">tool.py</Typography>
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

            <Typography className="text-sm font-normal mt-4 mb-2">requirements.txt</Typography>
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
