import React, { useMemo } from 'react';
import { Layout, Input, Typography, message, Collapse, Alert, Tooltip } from 'antd';
import { Editor } from '@monaco-editor/react';
import { MCPTemplate } from '@/studio/proto/agent_studio';
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface McpTemplateViewProps {
  mcpTemplateDetails: MCPTemplate | undefined;
  onRefresh?: () => void;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  annotations?: any;
}

const McpTemplateView: React.FC<McpTemplateViewProps> = ({ mcpTemplateDetails, onRefresh }) => {
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
              value={mcpTemplateDetails.name}
              disabled
              style={{
                marginTop: '8px',
                backgroundColor: '#fff',
                cursor: 'not-allowed',
                color: 'rgba(0, 0, 0, 0.88)',
              }}
            />
          </div>
        </div>
        <div style={{ flex: 0.5, overflowY: 'auto', paddingLeft: '16px', backgroundColor: '#fff' }}>
          {/* TODO: Add functionality to upload icons for the MCP here */}
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
    </div>
  );
};

export default McpTemplateView;
