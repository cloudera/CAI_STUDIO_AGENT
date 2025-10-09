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
          <CheckCircleOutlined className="text-[#52c41a]" />
        </Tooltip>
      );
    case 'VALIDATING':
      return (
        <Tooltip title="MCP is being validated">
          <ClockCircleOutlined className="text-[#faad14]" />
        </Tooltip>
      );
    case 'VALIDATION_FAILED':
      return (
        <Tooltip title="MCP validation failed">
          <CloseCircleOutlined className="text-[#f5222d]" />
        </Tooltip>
      );
    default:
      return (
        <Tooltip title="MCP status unknown">
          <ClockCircleOutlined className="text-[#faad14]" />
        </Tooltip>
      );
  }
};

const getTypeTag = (mcpType: string): React.ReactNode => {
  switch (mcpType) {
    case 'PYTHON':
      return (
        <Tag className="bg-[#c3d4fa] m-[2px] flex items-center gap-[4px]">
          <img src="/mcp_types/python.svg" alt="Python" className="w-[12px] h-[12px]" />
          <Text className="text-[9px] font-normal">Python</Text>
        </Tag>
      );
    case 'NODE':
      return (
        <Tag className="bg-[#c3fac3] m-[2px] flex items-center gap-[4px]">
          <img src="/mcp_types/node-js.svg" alt="Node.js" className="w-[12px] h-[12px]" />
          <Text className="text-[9px] font-normal">Node</Text>
        </Tag>
      );
    case 'DOCKER':
      return (
        <Tag className="bg-[#fac3e5] m-[2px] flex items-center gap-1">
          <img src="/mcp_types/docker.svg" alt="Docker" className="w-3 h-3" />
          <Text className="text-[9px] font-normal">Docker</Text>
        </Tag>
      );
    default:
      return (
        <Tag className="bg-[#f2f2f2] m-[2px]">
          <Text className="text-[9px] font-normal">Unknown</Text>
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
    <Layout className="flex flex-col h-full overflow-auto w-full bg-transparent">
      <List
        grid={{ gutter: 16 }}
        dataSource={mcpTemplates}
        renderItem={(item) => (
          <List.Item>
            <Layout
              className="rounded border border-[#f0f0f0] bg-white w-[320px] h-[164px] mr-3 mb-4 p-0 flex flex-col cursor-pointer transition-transform duration-200 ease-in-out shadow-md relative"
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
              <div className="absolute top-[8px] right-[8px] z-[10px]">{getTypeTag(item.type)}</div>

              <Layout className="flex-1 bg-transparent flex flex-row items-center px-6">
                {/* MCP Icon */}
                <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-4">
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
                    className="rounded-[2px] object-cover"
                  />
                </div>

                {/* Text */}
                <div className="flex-1 max-w-[220px]">
                  <div className="flex items-center min-w-0">
                    <Text className="text-[14px] font-normal inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-[90%]">
                      {truncateText(item.name, 50)}
                    </Text>
                    <div className="ml-2">{getStatusIcon(item.status)}</div>
                  </div>
                </div>
              </Layout>
              <Divider className="flex-grow-0 m-0" type="horizontal" />
              <Layout className="flex flex-row flex-grow-0 bg-transparent justify-center items-center">
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
                        className="border-none"
                        icon={<DeleteOutlined className="opacity-45" />}
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
