'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Layout,
  List,
  Typography,
  Popconfirm,
  Input,
  Space,
  Divider,
  Tooltip,
  Image,
  Spin,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { AgentTemplateMetadata } from '@/studio/proto/agent_studio';
import { useListGlobalToolTemplatesQuery } from '@/app/tools/toolTemplatesApi';
import { useRouter } from 'next/navigation';
import { useImageAssetsData } from '@/app/lib/hooks/useAssetData';

const { Text } = Typography;
const { Search } = Input;

interface AgentTemplateListProps {
  agentTemplates?: AgentTemplateMetadata[]; // Made optional for safety
  editExistingAgentTemplate: (templateId: string) => void;
  deleteExistingAgentTemplate: (templateId: string) => void;
  testAgentTemplate: (templateId: string) => void;
}

const truncateText = (text: string, maxWords: number) => {
  const words = text.split(' ');
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}...` : text;
};

const AgentList: React.FC<AgentTemplateListProps> = ({
  agentTemplates = [], // Default value to avoid undefined
  editExistingAgentTemplate,
  deleteExistingAgentTemplate,
  testAgentTemplate,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toolTemplateCache, setToolTemplateCache] = useState<Record<string, any>>({});
  const [loading, _setLoading] = useState(false);
  const { data: toolTemplates = [] } = useListGlobalToolTemplatesQuery({});
  const router = useRouter();

  const { imageData: toolIconsData } = useImageAssetsData(
    toolTemplates.map((tool) => tool.tool_image_uri),
  );

  useEffect(() => {
    // Only proceed if toolTemplates has changed and is not empty
    if (!toolTemplates || toolTemplates.length === 0) return;

    // Move this outside of useEffect to avoid setting state during render
    const toolTemplateMap = toolTemplates.reduce((acc: Record<string, any>, template: any) => {
      acc[template.id] = {
        name: template.name,
        imageURI: template.tool_image_uri,
      };
      return acc;
    }, {});

    // Compare with current cache to avoid unnecessary updates
    if (JSON.stringify(toolTemplateMap) !== JSON.stringify(toolTemplateCache)) {
      setToolTemplateCache(toolTemplateMap);
    }
  }, [toolTemplates]); // Remove toolTemplateCache from dependencies

  const filteredAgentTemplates = agentTemplates.filter((template) =>
    template?.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <Layout className="flex flex-col h-full overflow-auto w-full bg-transparent">
      <Space direction="vertical" className="w-full mb-4">
        <Search
          placeholder="Search agent templates by name"
          allowClear
          enterButton={<SearchOutlined />}
          onSearch={(value) => setSearchTerm(value)}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Space>

      <List
        grid={{ gutter: 16 }}
        dataSource={filteredAgentTemplates}
        renderItem={(item) => (
          <List.Item>
            <Layout
              className="rounded border border-[#f0f0f0] bg-white w-[400px] h-[190px] mr-3 mb-4 p-0 flex flex-col cursor-pointer transition-transform duration-200 ease-in-out shadow-md hover:shadow-lg hover:scale-[1.03]"
              onClick={() => router.push(`agents/edit/${item.id}`)}
            >
              <Layout className="flex-1 bg-transparent flex flex-col overflow-auto">
                <Text
                  className="pt-6 px-6 text-[14px] font-normal whitespace-nowrap overflow-hidden text-ellipsis"
                  title={item.name}
                >
                  {item.name}
                </Text>
                <Text className="pt-1 px-6 text-[11px] opacity-45 font-normal">
                  Goal:{' '}
                  <span className="text-black font-normal">
                    {truncateText(item.goal || 'N/A', 5)}
                  </span>
                </Text>
                <Text className="pt-1 px-6 text-[11px] opacity-45 font-normal">
                  Backstory:{' '}
                  <span className="text-black font-normal">
                    {truncateText(item.backstory || 'N/A', 5)}
                  </span>
                </Text>
                {item.tool_template_ids?.length > 0 && (
                  <Space className="mt-3 px-6 flex flex-wrap gap-[10px]">
                    {loading ? (
                      <Spin size="small" />
                    ) : (
                      item.tool_template_ids.map((toolTemplateId) => {
                        const toolTemplate = toolTemplateCache[toolTemplateId];
                        return toolTemplate ? (
                          <Tooltip title={toolTemplate.name} key={toolTemplateId} placement="top">
                            <div
                              className="w-6 h-6 rounded-full bg-[#f1f1f1] flex items-center justify-center cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Image
                                src={
                                  toolTemplate.imageURI && toolIconsData[toolTemplate.imageURI]
                                    ? toolIconsData[toolTemplate.imageURI]
                                    : '/fallback-image.png'
                                }
                                alt={toolTemplate.name}
                                width={16}
                                height={16}
                                preview={false}
                                className="rounded-sm object-cover"
                              />
                            </div>
                          </Tooltip>
                        ) : null;
                      })
                    )}
                  </Space>
                )}
              </Layout>
              <Divider className="flex-grow-0 m-0" type="horizontal" />
              <Layout className="flex flex-row flex-grow-0 bg-transparent justify-around items-center">
                <Button
                  className="border-none"
                  icon={<EditOutlined className="opacity-45" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    editExistingAgentTemplate(item.id);
                  }}
                />
                <Divider className="flex-grow-0 my-3" type="vertical" />
                <Popconfirm
                  title={`Delete ${item.name}?`}
                  okText="Confirm"
                  cancelText="Cancel"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    deleteExistingAgentTemplate(item.id);
                  }}
                >
                  <Button
                    className="border-none"
                    icon={<DeleteOutlined className="opacity-45" />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
                <Divider className="flex-grow-0 my-3" type="vertical" />
                <Button
                  className="border-none"
                  icon={<ExperimentOutlined className="opacity-45" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    testAgentTemplate(item.id);
                  }}
                  disabled
                />
              </Layout>
            </Layout>
          </List.Item>
        )}
      />
    </Layout>
  );
};

export default AgentList;
