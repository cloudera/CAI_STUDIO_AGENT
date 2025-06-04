import React from 'react';
import { Layout, List, Typography, Popconfirm, Button, Divider, Tooltip, Tag, Image } from 'antd';
import {
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { MCPTemplate } from '@/studio/proto/agent_studio';
import { useRouter } from 'next/navigation';
import { useImageAssetsData } from '../lib/hooks/useAssetData';

const { Text } = Typography;

interface MCPTemplateListProps {
  mcpTemplates: MCPTemplate[];
  deleteExistingTemplate: (templateId: string) => void;
}

const truncateText = (text: string, maxLength: number) => {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getStatusIcon = (status: string): React.ReactNode => {
  switch (status) {
    case 'VALID':
      return (
        <Tooltip title="MCP has been validated">
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        </Tooltip>
      );
    case 'VALIDATING':
      return (
        <Tooltip title="MCP is being validated">
          <ClockCircleOutlined style={{ color: '#faad14' }} />
        </Tooltip>
      );
    case 'VALIDATION_FAILED':
      return (
        <Tooltip title="MCP validation failed">
          <CloseCircleOutlined style={{ color: '#f5222d' }} />
        </Tooltip>
      );
    default:
      return (
        <Tooltip title="MCP status unknown">
          <ClockCircleOutlined style={{ color: '#faad14' }} />
        </Tooltip>
      );
  }
};

const getTypeTag = (mcpType: string): React.ReactNode => {
  switch (mcpType) {
    case 'PYTHON':
      return (
        <Tag style={{ background: '#c3d4fa', margin: 0 }}>
          <Text style={{ fontSize: 9, fontWeight: 400 }}>Python</Text>
        </Tag>
      );
    case 'NODE':
      return (
        <Tag style={{ background: '#c3fac3', margin: 0 }}>
          <Text style={{ fontSize: 9, fontWeight: 400 }}>Node</Text>
        </Tag>
      );
    case 'DOCKER':
      return (
        <Tag style={{ background: '#fac3e5', margin: 0 }}>
          <Text style={{ fontSize: 9, fontWeight: 400 }}>Docker</Text>
        </Tag>
      );
    default:
      return (
        <Tag style={{ background: '#f2f2f2', margin: 0 }}>
          <Text style={{ fontSize: 9, fontWeight: 400 }}>Unknown</Text>
        </Tag>
      );
  }
};

const MCPTemplateList: React.FC<MCPTemplateListProps> = ({
  mcpTemplates,
  deleteExistingTemplate,
}) => {
  const router = useRouter();
  const { imageData: mcpIconsData } = useImageAssetsData(mcpTemplates.map((mcp) => mcp.image_uri));

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
                position: 'relative',
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
              {/* Type Tag - Top Right Corner */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  zIndex: 10,
                }}
              >
                {getTypeTag(item.type)}
              </div>

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
                {/* MCP Icon */}
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
                  <Image
                    src={
                      item.image_uri
                        ? mcpIconsData[item.image_uri] || '/mcp-icon.svg'
                        : '/mcp-icon.svg'
                    }
                    alt="MCP"
                    width={16}
                    height={16}
                    preview={false}
                    style={{
                      borderRadius: '2px',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Text */}
                <div style={{ flex: 1, maxWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '90%',
                      }}
                    >
                      {truncateText(item.name, 50)}
                    </Text>
                    {/* Status Icon */}
                    <div style={{ marginLeft: '8px' }}>{getStatusIcon(item.status)}</div>
                  </div>
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
