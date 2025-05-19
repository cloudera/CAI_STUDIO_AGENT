import React, { useMemo } from 'react';
import { Layout, Input, Typography, message, Collapse } from 'antd';
import { Editor } from '@monaco-editor/react';
import { MCPTemplate } from '@/studio/proto/agent_studio';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface McpTemplateViewProps {
  mcpTemplateDetails: MCPTemplate | undefined;
  onRefresh?: () => void;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations?: any;
}

const McpTemplateView: React.FC<McpTemplateViewProps> = ({ mcpTemplateDetails, onRefresh }) => {
  const parsedTools = useMemo(() => {
    if (!mcpTemplateDetails?.tools) {
      return [];
    }
    try {
      const toolsArray: McpTool[] = JSON.parse(mcpTemplateDetails.tools);
      return toolsArray;
    } catch (error) {
      console.error('Failed to parse MCP tools JSON:', error);
      message.error('Failed to display tools: Invalid format provided by MCP.');
      return [];
    }
  }, [mcpTemplateDetails?.tools]);

  if (!mcpTemplateDetails) {
    return <Text>Loading MCP details...</Text>;
  }

  return (
    <Layout
      style={{
        flex: 1,
        background: '#fff',
        overflowY: 'auto',
        padding: '16px',
      }}
    >
      <Text strong>MCP Name</Text>
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
      <div style={{ margin: '16px 0' }} />

      <Text strong>Tools Available</Text>
      {parsedTools.length > 0 ? (
        <Collapse accordion style={{ marginTop: '8px' }}>
          {parsedTools.map((tool, index) => (
            <Panel header={tool.name || `Tool ${index + 1}`} key={`${tool.name}-${index}`}>
              <div style={{ marginBottom: '12px' }}>
                <Text strong>Description:</Text>
                <Paragraph style={{ marginTop: '4px', marginBottom: 0, whiteSpace: 'pre-line' }}>
                  {tool.description || 'No description provided.'}
                </Paragraph>
              </div>

              <div>
                <Text strong>Input Schema:</Text>
                <div style={{ marginTop: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                  <Editor
                    height="250px"
                    defaultLanguage="json"
                    value={JSON.stringify(tool.inputSchema, null, 2)}
                    theme="vs-dark"
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
      )}
    </Layout>
  );
};

export default McpTemplateView;
