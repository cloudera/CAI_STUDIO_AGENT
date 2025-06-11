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
      const serverConfig = config.mcpServers[serverName];

      // Check for unknown fields
      const allowedFields = ['command', 'args', 'env'];
      const configFields = Object.keys(serverConfig);
      const unknownFields = configFields.filter((field) => !allowedFields.includes(field));

      if (unknownFields.length > 0) {
        setValidationError(
          <>
            Only supported JSON fields are: <Text code>command</Text>, <Text code>args</Text> and{' '}
            <Text code>env</Text>.
          </>,
        );
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
            Only <Text code>uvx</Text> (for Python-based) and <Text code>npx</Text> (for Node-based)
            are supported as runtimes for MCP servers currently.
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
    } catch (error) {
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
    if (!file) return;

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
      console.log('File uploaded to:', fp);
      setUploadedFilePath(fp);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      console.error('Upload failed:', error);
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
      okButtonProps={{ disabled: !isValid }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Alert
          message={
            'Environment variable values are not saved by the Agent Studio for security purposes ' +
            'and the values would be required to be inputted again while configuring a workflow.'
          }
          type="info"
          showIcon
        />

        <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
          {/* MCP Server Configuration - 75% */}
          <div style={{ flex: '0 0 75%' }}>
            <Text style={{ marginBottom: '8px', display: 'block' }}>MCP Server Configuration:</Text>

            <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px', overflow: 'hidden' }}>
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
          <div style={{ flex: '0 0 25%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text style={{ marginBottom: '8px', display: 'block' }}>Icon (Optional):</Text>

              <div
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}
              >
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
                  style={{ flex: 1 }}
                >
                  <Button
                    icon={selectedFile ? <FileImageOutlined /> : <UploadOutlined />}
                    loading={isUploading}
                    disabled={selectedFile !== null}
                    style={{ width: '100%' }}
                  >
                    {selectedFile ? selectedFile.name : 'Upload Icon'}
                  </Button>
                </Upload>
              </div>

              <Text
                type="secondary"
                style={{ fontSize: '11px', marginTop: '8px', lineHeight: '1.4' }}
              >
                Upload a PNG or JPEG image (max 64KB) to customize the MCP server icon.
              </Text>
            </div>
          </div>
        </div>

        {/* Validation Messages - Full Width */}
        {serverNameInfo && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
              <InfoCircleOutlined style={{ color: '#4d7cff', marginRight: '4px' }} />
              <Text type="secondary" style={{ fontSize: '12px', color: '#4d7cff' }}>
                {serverNameInfo}
              </Text>
            </div>
          </div>
        )}

        {validationError && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
              <WarningOutlined style={{ color: '#ff4d4f', marginRight: '4px' }} />
              <Text type="danger" style={{ fontSize: '12px' }}>
                {validationError}
              </Text>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RegisterMCPTemplateModal;
