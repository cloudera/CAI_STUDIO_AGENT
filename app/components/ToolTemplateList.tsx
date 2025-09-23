import React, { useState } from 'react';
import { Button, Layout, List, Typography, Popconfirm, Input, Divider, Space, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation'; // Use Next.js router
import { ToolTemplate } from '@/studio/proto/agent_studio';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';
import i18n from '../utils/i18n';

const { Text } = Typography;
const { Search } = Input;

interface ToolsListProps {
  tools: ToolTemplate[];
  editExistingTemplate: (toolId: string) => void;
  deleteExistingTemplate: (templateId: string) => void;
}

const truncateText = (text: string, maxLength: number) => {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const ToolTemplateList: React.FC<ToolsListProps> = ({
  tools,
  editExistingTemplate,
  deleteExistingTemplate,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const router = useRouter();

  const { imageData } = useImageAssetsData(tools.map((tool) => tool.tool_image_uri));

  // Filter tools based on the search term
  const filteredTools = tools.filter((tool) =>
    tool.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <Layout className="flex flex-col h-full overflow-auto w-full bg-[#f5f5f5]">
      {/* Search Bar */}
      <Space direction="vertical" className="w-full mb-4">
        <Search
          placeholder="Search tools by name"
          allowClear
          enterButton={<SearchOutlined />}
          onSearch={(value) => setSearchTerm(value)}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Space>

      {/* Tool List */}
      <List
        grid={{ gutter: 16 }}
        dataSource={filteredTools}
        renderItem={(item) => (
          <List.Item>
            <Layout
              className="rounded border border-[#f0f0f0] bg-white w-[320px] h-[164px] mr-3 mb-4 p-0 flex flex-col cursor-pointer transition-transform duration-200 ease-in-out shadow-md"
              onClick={() => router.push(`/tools/view/${item.id}`)} // Navigate to tool details page
              onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }}
            >
              <Layout className="flex-1 bg-transparent flex flex-row items-center px-6">
                {/* Image - Always show either custom icon or fallback */}
                <div className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center mr-4">
                  {item.tool_image_uri && imageData[item.tool_image_uri] ? (
                    <img
                      src={imageData[item.tool_image_uri]}
                      alt={item.name}
                      className="w-4 h-4 object-cover rounded-sm"
                    />
                  ) : (
                    <ToolOutlined style={{ fontSize: '16px', color: '#9ca3af' }} />
                  )}
                </div>
                {/* Text */}
                <div className="flex-1 max-w-[220px]">
                  <Tooltip title={item.name}>
                    <Text className="text-[14px] font-normal block whitespace-nowrap overflow-hidden text-ellipsis">
                      {truncateText(item.name, 50)}
                    </Text>
                  </Tooltip>
                  <Tooltip title={item.tool_description || 'N/A'}>
                    <Text className="pt-1 block text-[11px] opacity-45 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                      {truncateText(item.tool_description || 'N/A', 100)}
                    </Text>
                  </Tooltip>
                </div>
              </Layout>
              <Divider className="flex-grow-0 m-0" type="horizontal" />
              <Layout className="flex flex-row flex-grow-0 bg-transparent justify-around items-center">
                {/* Edit Button */}
                <Tooltip
                  title={item.pre_built ? 'Prepackaged tools cannot be edited' : 'Edit Tool'}
                >
                  <Button
                    className="border-none"
                    icon={<EditOutlined className="opacity-45" />}
                    disabled={item.pre_built}
                    onClick={(e) => {
                      e.stopPropagation();
                      editExistingTemplate(item.id);
                    }}
                  />
                </Tooltip>
                <Divider className="flex-grow-0 my-3" type="vertical" />
                {/* Delete Button */}
                <Tooltip
                  title={item.pre_built ? 'Prepackaged tools cannot be deleted' : 'Delete Tool'}
                >
                  <div>
                    {' '}
                    {/* Wrap in div so tooltip works when button disabled */}
                    <Popconfirm
                      title={`Delete ${item.name}?`}
                      description={`Are you sure you'd like to delete ${item.name}?`}
                      placement="topRight"
                      okText={i18n.t('common.confirm')}
                      cancelText={i18n.t('common.cancel')}
                      onConfirm={(e) => {
                        e?.stopPropagation(); // Prevent card click event
                        deleteExistingTemplate(item.id);
                      }}
                      onCancel={(e) => e?.stopPropagation()} // Prevent card click event
                    >
                      <Button
                        className="border-none"
                        icon={<DeleteOutlined className="opacity-45" />}
                        disabled={item.pre_built}
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

export default ToolTemplateList;
