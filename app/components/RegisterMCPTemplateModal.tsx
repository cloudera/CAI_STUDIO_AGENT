import React, { useState, useEffect } from 'react';
import { Modal, Typography, Alert } from 'antd';
import { InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';

const { Text } = Typography;

interface RegisterMCPTemplateModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onRegister: (mcpName: string, mcpType: string, mcpArgs: string, envNames: string[]) => void;
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
    if (isOpen && !jsonInput) {
      setJsonInput(defaultJson);
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

      // Check command is uvx
      if (serverConfig.command !== 'uvx') {
        setValidationError(
          <>
            Only <Text code>uvx</Text> is supported as the runtime for (python-based) MCP servers
            currently.
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

  const handleRegister = () => {
    if (isValid && parsedConfig) {
      const serverName = Object.keys(parsedConfig.mcpServers)[0];
      const serverConfig = parsedConfig.mcpServers[serverName];

      // Convert to the format expected by the parent component
      const mcpArgs = serverConfig.args.join(' ');
      const envNames = serverConfig.env ? Object.keys(serverConfig.env) : [];

      onRegister(serverName, 'PYTHON', mcpArgs, envNames);

      // Reset form
      setJsonInput('');
      setValidationError('');
      setIsValid(false);
      setParsedConfig(null);
    }
  };

  const handleCancel = () => {
    // Reset form
    setJsonInput('');
    setValidationError('');
    setServerNameInfo('');
    setIsValid(false);
    setParsedConfig(null);
    onCancel();
  };

  return (
    <Modal
      title="Register MCP Server"
      width="60%"
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

        <div>
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

          {serverNameInfo && (
            <div style={{ marginTop: '8px' }}>
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
      </div>
    </Modal>
  );
};

export default RegisterMCPTemplateModal;
