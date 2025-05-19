import React from 'react';
import { Layout, List, Typography, Popconfirm, Button, Divider, Tooltip } from 'antd';
import {
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { MCPTemplate } from '@/studio/proto/agent_studio';
import { useRouter } from 'next/navigation';

const { Text } = Typography;

interface MCPTemplateListProps {
  mcpTemplates: MCPTemplate[];
  deleteExistingTemplate: (templateId: string) => void;
}

const truncateText = (text: string, maxLength: number) => {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'VALID':
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    case 'VALIDATING':
      return <ClockCircleOutlined style={{ color: '#faad14' }} />;
    case 'VALIDATION_FAILED':
      return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
    default:
      return <ClockCircleOutlined style={{ color: '#faad14' }} />;
  }
};

const MCPTemplateList: React.FC<MCPTemplateListProps> = ({
  mcpTemplates,
  deleteExistingTemplate,
}) => {
  const router = useRouter();

  return (
    <Layout
      style={{
        flex: 1,
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        width: '100%',
        background: 'transparent',
      }}
    >
      <List
        grid={{ gutter: 16 }}
        dataSource={mcpTemplates}
        renderItem={(item) => (
          <List.Item>
            <Layout
              style={{
                borderRadius: '4px',
                border: 'solid 1px #f0f0f0',
                backgroundColor: '#fff',
                width: '320px',
                height: '164px',
                margin: '0px 12px 16px 0px',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={() => router.push(`/mcp/view/${item.id}`)} // Navigate to MCP View page
              onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }}
            >
              <Layout
                style={{
                  flex: 1,
                  background: 'transparent',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingLeft: '24px',
                  paddingRight: '24px',
                }}
              >
                {/* Status Icon */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#f1f1f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '16px',
                  }}
                >
                  {getStatusIcon(item.status)}
                </div>

                {/* Text */}
                <div style={{ flex: 1, maxWidth: '220px' }}>
                  <Tooltip title={item.name}>
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {truncateText(item.name, 50)}
                    </Text>
                  </Tooltip>
                  <Tooltip title={item.type || 'N/A'}>
                    <Text
                      style={{
                        paddingTop: '4px',
                        display: 'block',
                        fontSize: '11px',
                        opacity: 0.45,
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {truncateText(item.type || 'N/A', 100)}
                    </Text>
                  </Tooltip>
                </div>
              </Layout>
              <Divider style={{ flexGrow: 0, margin: '0px' }} type="horizontal" />
              <Layout
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexGrow: 0,
                  background: 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {/* Delete Button */}
                <Tooltip title="Delete MCP Server">
                  <div>
                    <Popconfirm
                      title={`Delete ${item.name}?`}
                      description={`Are you sure you'd like to delete ${item.name}?`}
                      placement="topRight"
                      okText="Confirm"
                      cancelText="Cancel"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        deleteExistingTemplate(item.id);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        style={{ border: 'none' }}
                        icon={<DeleteOutlined style={{ opacity: 0.45 }} />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </Tooltip>
              </Layout>
            </Layout>
          </List.Item>
        )}
      />
    </Layout>
  );
};

export default MCPTemplateList;
