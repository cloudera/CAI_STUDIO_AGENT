import React, { useState } from 'react';
import { Modal, Input, Layout, Radio, Typography, Tooltip, Button } from 'antd';
import { DeleteOutlined, InfoCircleFilled, PlusCircleOutlined } from '@ant-design/icons';


const { Text } = Typography;

interface RegisterMCPTemplateModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onRegister: (mcpName: string, mcpType: string, mcpArgs: string, envNames: string[]) => void;
}

const RegisterMCPTemplateModal: React.FC<RegisterMCPTemplateModalProps> = ({
  isOpen,
  onCancel,
  onRegister,
}) => {
  const [mcpName, setMcpName] = useState('');
  const [mcpType, setMcpType] = useState<'PYTHON' | 'NODE'>('PYTHON');
  const [mcpArgs, setMcpArgs] = useState('');
  const [envNames, setEnvNames] = useState<string[]>([]);

  const mcpTypeMappings = {
    'PYTHON': {
      command: 'uvx',
      guidance: 'uvx is used to run python-based MCPs.'
    },
    'NODE': {
      command: 'npx',
      guidance: 'npx is used to run node-based MCPs.'
    },
  }

  const handleRegister = () => {
    if (mcpName.trim() && mcpType && mcpArgs.trim()) {
      onRegister(mcpName.trim(), mcpType, mcpArgs.trim(), envNames);
    }
    // set back fields to default values
    setMcpName('');
    setMcpType('PYTHON');
    setMcpArgs('');
    setEnvNames([]);
  };

  return (
    <Modal
      title="Register MCP Server"
      width="45%"
      open={isOpen}
      onCancel={onCancel}
      onOk={handleRegister}
      okText="Register"
      cancelText="Cancel"
    >
      <Layout style={{ flexDirection: 'column' }}>
        <Input
          placeholder="Enter MCP Name"
          value={mcpName}
          onChange={(e) => setMcpName(e.target.value)}
        />
        <Radio.Group
          onChange={(e) => setMcpType(e.target.value)}
          value={mcpType}
          options={[
            {
              value: 'PYTHON',
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  Python
                  <Tooltip title={mcpTypeMappings['PYTHON'].guidance}>
                    <InfoCircleFilled style={{ marginLeft: 8, cursor: 'pointer' }} />
                  </Tooltip>
                </div>
              )
            },
            {
              value: 'NODE',
              label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  Node
                  <Tooltip title={mcpTypeMappings['NODE'].guidance}>
                    <InfoCircleFilled style={{ marginLeft: 8, cursor: 'pointer' }} />
                  </Tooltip>
                </div>
              )
            }
          ]}
        />
        <p style={{ marginBottom: '10px' }}>
          Enter the command to run the MCP.
        </p>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '4px', color: '#850020', fontFamily: 'monospace' }}>
            {mcpTypeMappings[mcpType].command}
          </span>
          <Input
            value={mcpArgs}
            onChange={(e) => setMcpArgs(e.target.value)}
            placeholder=''
          />
        </div>
        <p style={{ marginBottom: '10px' }}>
          Please mention the environment variable names that are required by the MCP.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {envNames.map((envName, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
              <Input
                value={envName}
                onChange={(e) => {
                  const newEnvNames = [...envNames];
                  newEnvNames[index] = e.target.value;
                  setEnvNames(newEnvNames);
                }}
                placeholder="ENV_VAR_NAME"
                style={{ marginRight: '8px' }}
              />
              <Button
                type="primary"
                shape="circle"
                icon={<PlusCircleOutlined />}
                onClick={() => {
                  const newEnvNames = [...envNames];
                  newEnvNames.splice(index + 1, 0, '');
                  setEnvNames(newEnvNames);
                }}
              />
              {envNames.length > 1 && (
                <Button
                  type="text"
                  danger
                  shape="circle"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    const newEnvNames = [...envNames];
                    newEnvNames.splice(index, 1);
                    setEnvNames(newEnvNames);
                  }}
                  style={{ marginLeft: '4px' }}
                />
              )}
            </div>
          ))}
          {envNames.length === 0 && (
            <Button
              type="dashed"
              icon={<PlusCircleOutlined />}
              onClick={() => setEnvNames([''])}
              style={{ width: '100%' }}
            >
              Add Environment Variable
            </Button>
          )}
        </div>
      </Layout>
    </Modal>
  )
}

export default RegisterMCPTemplateModal;