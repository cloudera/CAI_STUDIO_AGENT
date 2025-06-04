import React, { useEffect, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeToolbar } from '@xyflow/react';
import { Avatar, Image, Typography, Tag, Tooltip } from 'antd';

const { Paragraph } = Typography;

type InfoType = 'Completion' | 'TaskStart' | 'ToolInput' | 'ToolOutput';

type McpNode = Node<
  {
    name: string;
    iconData: string;
    active: boolean;
    activeTool?: string;
    toolList?: string[];
    info?: string;
    infoType?: InfoType;
    isMostRecent?: boolean;
  },
  'task'
>;

export default function McpNode({ data }: NodeProps<McpNode>) {
  const [isHovered, setIsHovered] = useState(false);

  // Process tools list
  const getDisplayTools = () => {
    if (!data.toolList || data.toolList.length === 0) {
      return [];
    }

    let tools = [...data.toolList];

    // If data.activeTool exists, filter it out from the regular list
    if (data.activeTool) {
      tools = tools.filter((tool) => tool !== data.activeTool);
    }

    return tools;
  };

  const totalTagsToShow = 4;
  const displayTools = getDisplayTools();
  const maxToolsToShow = data.activeTool && data.active ? totalTagsToShow - 2 : totalTagsToShow - 1; // Leave space for active tool
  let toolsToShow = displayTools.slice(0, maxToolsToShow);
  let extraToolsCount = Math.max(0, displayTools.length - maxToolsToShow);
  if (extraToolsCount === 1) {
    // Show that tool already if there's only 1 extra tool
    toolsToShow = displayTools.slice(0, maxToolsToShow + 1);
    extraToolsCount = 0;
  }
  const emptyTagsToRender = Math.max(
    0,
    totalTagsToShow -
      (data.activeTool && data.active ? 1 : 0) -
      toolsToShow.length -
      (extraToolsCount > 0 ? 1 : 0),
  );

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        paddingBottom: '12px',
        background: '#c3fac3',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        border: isHovered ? '2px solid rgb(47, 47, 47)' : '2px solid rgba(0,0,0,0)',
        animation: data.active ? 'pulse-in-out 1.0s infinite ease-in-out' : 'none',
        maxWidth: 200,
        minHeight: 120,
      }}
    >
      {data.info && (
        <>
          <NodeToolbar
            isVisible={true}
            className="rounded-sm bg-primary p-2 text-primary-foreground"
            position={Position.Top}
            tabIndex={1}
            style={{
              maxWidth: 500,
              opacity: 0.8,
              backgroundColor: '#1890ff',
            }}
          >
            <Paragraph
              ellipsis={{ rows: 8 }}
              style={{
                padding: 0,
                margin: 0,
                fontSize: 12,
                fontWeight: 300,
                color: 'white',
              }}
            >
              {isHovered ? data.info : 'MCP Tool invocation'}
            </Paragraph>
          </NodeToolbar>
        </>
      )}

      {/* Ant Design Avatar */}
      <Avatar
        style={{
          position: 'absolute',
          bottom: -25,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          backgroundColor: 'white',
          padding: 5,
        }}
        size={36}
        icon={data.iconData ? <Image src={data.iconData} /> : <Image src="/mcp-icon.svg" />}
      />

      {/* Node Content */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'regular',
          padding: 0,
          marginBottom: 8,
        }}
      >
        <Paragraph
          ellipsis={{ rows: 2 }}
          style={{ padding: 0, margin: 0, fontSize: 14, fontWeight: 400 }}
        >
          {data.name}
        </Paragraph>
      </div>

      {/* Tools Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          width: '100%',
        }}
      >
        {/* Active Tool (if exists and active) */}
        {data.activeTool && data.active && (
          <Tag
            style={{
              backgroundColor: 'rgb(3, 149, 46)',
              color: 'white',
              fontSize: 9,
              fontWeight: 400,
              border: '2px solid black',
              margin: 1,
              width: '148px',
              borderRadius: '12px',
              textAlign: 'center',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 400 }}>
              {data.activeTool.length > 22
                ? `${data.activeTool.substring(0, 20)}...`
                : data.activeTool}
            </span>
          </Tag>
        )}

        {/* Regular Tools */}
        {toolsToShow.map((tool, index) => (
          <Tag
            key={`${tool}-${index}`}
            style={{
              backgroundColor: 'rgb(3, 149, 46)',
              color: 'white',
              fontSize: 9,
              fontWeight: 400,
              margin: 1,
              width: '148px',
              borderRadius: '12px',
              textAlign: 'center',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 400 }}>
              {tool.length > 22 ? `${tool.substring(0, 20)}...` : tool}
            </span>
          </Tag>
        ))}

        {/* Ellipsis indicator */}
        {extraToolsCount > 0 && (
          <Tag
            style={{
              backgroundColor: 'rgb(3, 149, 46)',
              color: 'white',
              fontSize: 9,
              fontWeight: 400,
              margin: 1,
              width: '148px',
              borderRadius: '12px',
              textAlign: 'center',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 400, color: '#f8fac3' }}>
              +{extraToolsCount} more tools
            </span>
          </Tag>
        )}

        {/* Empty tags so that each MCP node has same height */}
        {emptyTagsToRender > 0 &&
          Array.from({ length: emptyTagsToRender }).map((_, index) => (
            <Tag
              key={`empty-${index}`}
              style={{
                backgroundColor: 'transparent',
                color: 'transparent',
                fontSize: 9,
                fontWeight: 400,
                margin: 1,
                width: '148px',
                border: 'transparent',
                borderRadius: '12px',
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 400, color: 'transparent' }}>N/A</span>
            </Tag>
          ))}
      </div>

      {/* Handles for React Flow */}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
    </div>
  );
}
