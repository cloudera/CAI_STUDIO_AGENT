import React, { useState, useEffect } from 'react';
import { Modal, Typography, Alert, Upload, Button } from 'antd';
import {
  InfoCircleOutlined,
  WarningOutlined,
  UploadOutlined,
  FileImageOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useGlobalNotification } from './Notifications';
import { uploadFile } from '../lib/fileUpload';

const { Text } = Typography;

const runtimeToTypeMapping: Record<string, string> = {
  uvx: 'PYTHON',
  npx: 'NODE',
};

interface RegisterMCPTemplateModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onRegister: (
    mcpName: string,
    mcpType: string,
    mcpArgs: string,
    envNames: string[],
    iconPath: string,
  ) => void;
  loading?: boolean;
}

interface MCPConfig {
  mcpServers: {
    [key: string]: {
      command: string;
      args: string[];
      env?: {
        [key: string]: string;
      };
    };
  };
}

const RegisterMCPTemplateModal: React.FC<RegisterMCPTemplateModalProps> = ({
  isOpen,
  onCancel,
  onRegister,
  loading = false,
}) => {
  const [jsonInput, setJsonInput] = useState('');
  const [validationError, setValidationError] = useState<React.ReactNode>('');
  const [serverNameInfo, setServerNameInfo] = useState<React.ReactNode>('');
  const [isValid, setIsValid] = useState(false);
  const [parsedConfig, setParsedConfig] = useState<MCPConfig | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const notificationApi = useGlobalNotification();

  const defaultJson = `{
  "mcpServers": {
    "Example MCP Server": {
      "command": "uvx",
      "args": ["mcp-server-time", "--local-timezone=America/New_York"],
      "env": {}
    }
  }
}`;

  const availableRuntimeMessage: React.ReactNode = (
    <>
      Only <Text code>uvx</Text> (for Python-based) and <Text code>npx</Text> (for Node.js-based)
      are supported as runtimes for MCP servers currently.
    </>
  );

  useEffect(() => {
    if (isOpen) {
      if (!jsonInput) {
        setJsonInput(defaultJson);
      }
      // Reset file upload states when modal is opened
      setUploadedFilePath('');
      setSelectedFile(null);
      setIsUploading(false);
    }
  }, [isOpen]);

  const validateJson = (input: string) => {
    if (!input.trim()) {
      setValidationError('');
      setIsValid(false);
      setParsedConfig(null);
      return;
    }

    try {
      const config: MCPConfig = JSON.parse(input);

      // Check if mcpServers exists
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        setValidationError('JSON must contain "mcpServers" object.');
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      const serverKeys = Object.keys(config.mcpServers);

      // Check for multiple servers
      if (serverKeys.length > 1) {
        setValidationError("Multiple MCP servers can't be registered at the same time.");
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      if (serverKeys.length === 0) {
        setValidationError('At least one MCP server must be defined.');
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      const serverName = serverKeys[0].trim();
      if (serverName === '') {
        setValidationError('Server name cannot be empty.');
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // Validate server name format (same as backend validation)
      if (!/^[a-zA-Z0-9 _-]+$/.test(serverName)) {
        setValidationError(
          'MCP name must only contain alphabets, numbers, spaces, underscores, and hyphens.',
        );
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      const serverConfig = config.mcpServers[serverName];

      // Check for unknown fields
      const allowedFields = ['command', 'args', 'env'];
      const configFields = Object.keys(serverConfig);
      const unknownFields = configFields.filter((field) => !allowedFields.includes(field));

      if (unknownFields.length > 0) {
        setValidationError(availableRuntimeMessage);
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // Check for required fields
      if (!serverConfig.command || !serverConfig.args) {
        setValidationError(
          <>
            Both <Text code>command</Text> and <Text code>args</Text> fields are required.
          </>,
        );
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // Check command is uvx or npx
      if (!Object.keys(runtimeToTypeMapping).includes(serverConfig.command)) {
        setValidationError(
          <>
            Only <Text code>uvx</Text> (for Python-based) and <Text code>npx</Text> (for
            Node.js-based) are supported as runtimes for MCP servers currently.
          </>,
        );
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // Check args is array
      if (!Array.isArray(serverConfig.args)) {
        setValidationError(
          <>
            <Text code>args</Text> must be an array
          </>,
        );
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // Check env is object if present
      if (serverConfig.env && typeof serverConfig.env !== 'object') {
        setValidationError(
          <>
            <Text code>env</Text> must be an object
          </>,
        );
        setServerNameInfo('');
        setIsValid(false);
        setParsedConfig(null);
        return;
      }

      // All validations passed
      setServerNameInfo(
        <>
          The MCP Server name would be <Text code>{serverName}</Text>. The sub-key under
          "mcpServers" can be used to change the name.
        </>,
      );
      setValidationError('');
      setIsValid(true);
      setParsedConfig(config);
    } catch (_error) {
      setValidationError('Invalid JSON format');
      setServerNameInfo('');
      setIsValid(false);
      setParsedConfig(null);
    }
  };

  useEffect(() => {
    validateJson(jsonInput);
  }, [jsonInput]);

  const handleFileUpload = async (file: File) => {
    if (!file) {
      return;
    }

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      notificationApi.error({
        message: 'Please upload a PNG or JPEG image file',
        placement: 'topRight',
      });
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
      const fp = await uploadFile(file, setIsUploading);

      setUploadedFilePath(fp);
      setSelectedFile(file);
    } catch (_error) {
      setSelectedFile(null);
      console.error('Upload failed');
      notificationApi.error({
        message: 'Failed to upload file',
        placement: 'topRight',
      });
    }
  };

  const handleRegister = () => {
    if (isValid && parsedConfig) {
      const serverName = Object.keys(parsedConfig.mcpServers)[0];
      const serverConfig = parsedConfig.mcpServers[serverName];

      // Convert to the format expected by the parent component
      const mcpArgs = serverConfig.args.join(' ');
      const envNames = serverConfig.env ? Object.keys(serverConfig.env) : [];

      onRegister(
        serverName,
        runtimeToTypeMapping[serverConfig.command],
        mcpArgs,
        envNames,
        uploadedFilePath,
      );

      // Reset form
      setJsonInput('');
      setValidationError('');
      setIsValid(false);
      setParsedConfig(null);
      setUploadedFilePath('');
      setSelectedFile(null);
    }
  };

  const handleCancel = () => {
    // Reset form
    setJsonInput('');
    setValidationError('');
    setServerNameInfo('');
    setIsValid(false);
    setParsedConfig(null);
    setUploadedFilePath('');
    setSelectedFile(null);
    onCancel();
  };

  return (
    <Modal
      title="Register MCP Server"
      width="70%"
      open={isOpen}
      onCancel={handleCancel}
      onOk={handleRegister}
      okText="Register"
      cancelText="Cancel"
      confirmLoading={loading}
      okButtonProps={{ disabled: !isValid }}
    >
      <div className="flex flex-col gap-4">
        <Alert
          message={
            'For security reasons, Agent Studio does not save environment variable values. ' +
            'The values would need to be entered again while configuring a workflow. ' +
            'It is recommended to use dummy values here for the environment variables.'
          }
          type="info"
          showIcon
        />

        <div className="flex flex-row gap-4">
          {/* MCP Server Configuration - 75% */}
          <div className="flex-[0_0_75%]">
            <Text className="mb-2 block">MCP Server Configuration:</Text>

            <div className="border border-solid border-[#d9d9d9] rounded overflow-hidden">
              <Editor
                height="300px"
                defaultLanguage="json"
                theme="vs-light"
                value={jsonInput}
                onChange={(value) => setJsonInput(value || '')}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
              />
            </div>
          </div>

          {/* Icon Upload - 25% */}
          <div className="flex-[0_0_25%]">
            <div className="flex flex-col">
              <Text className="mb-2 block">Icon (Optional):</Text>

              <div className="flex flex-row items-center gap-2">
                {selectedFile && (
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadedFilePath('');
                    }}
                  />
                )}

                <Upload
                  accept=".png,.jpg,.jpeg"
                  customRequest={({ file, onSuccess, onError }) => {
                    handleFileUpload(file as File)
                      .then(() => onSuccess?.('ok'))
                      .catch((err) => onError?.(err));
                  }}
                  showUploadList={false}
                  disabled={isUploading}
                  className="flex-1"
                >
                  <Button
                    icon={selectedFile ? <FileImageOutlined /> : <UploadOutlined />}
                    loading={isUploading}
                    disabled={selectedFile !== null}
                    className="w-full"
                  >
                    {selectedFile ? selectedFile.name : 'Upload Icon'}
                  </Button>
                </Upload>
              </div>

              <Text className="text-xs mt-2 leading-[1.4]">
                Upload a PNG or JPEG image (max 64KB) to customize the MCP server icon.
              </Text>
            </div>
          </div>
        </div>

        {/* Validation Messages - Full Width */}
        {serverNameInfo && (
          <div className="mt-4 flex flex-col">
            <div className="flex items-center text-xs">
              <InfoCircleOutlined className="text-[#4d7cff] mr-1" />
              <Text className="text-xs text-[#4d7cff]">{serverNameInfo}</Text>
            </div>
            <div className="flex items-center text-xs mt-0.5">
              <InfoCircleOutlined className="text-[#4d7cff] mr-1" />
              <Text className="text-xs text-[#4d7cff]">{availableRuntimeMessage}</Text>
            </div>
          </div>
        )}

        {validationError && (
          <div className="mt-2">
            <div className="flex items-center text-xs">
              <WarningOutlined className="text-[#ff4d4f] mr-1" />
              <Text className="text-xs text-danger">{validationError}</Text>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RegisterMCPTemplateModal;
