import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeToolbar } from '@xyflow/react';
import { Avatar, Image, Typography } from 'antd';
import { ToolOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

type InfoType = 'Completion' | 'TaskStart' | 'ToolInput' | 'ToolOutput';

type ToolNode = Node<
  {
    name: string;
    iconData: string;
    active: boolean;
    info?: string;
    infoType?: InfoType;
    isMostRecent?: boolean;
  },
  'task'
>;

export default function ToolNode({ data }: NodeProps<ToolNode>) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: '#f3f3f3',
        backgroundColor: '#d3d3d3',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        border: isHovered ? '2px solid rgb(47, 47, 47)' : '2px solid rgba(0,0,0,0)',
        animation: data.active ? 'pulse-in-out 1.0s infinite ease-in-out' : 'none',
        maxWidth: 200,
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
              {isHovered ? data.info : 'Tool Use'}
            </Paragraph>
          </NodeToolbar>
        </>
      )}

      {/* Ant Design Avatar */}
      <Avatar
        style={{
          position: 'absolute',
          bottom: -25,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', // Optional shadow for floating look,
          backgroundColor: 'white',
          padding: data.iconData ? 5 : 0,
        }}
        size={36}
        icon={
          data.iconData ? (
            <Image src={data.iconData} />
          ) : (
            <ToolOutlined style={{ opacity: 0.6, color: 'black' }} />
          )
        }
      />

      {/* Node Content */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'regular',
          padding: 0,
        }}
      >
        <Paragraph
          ellipsis={{ rows: 2 }}
          style={{ padding: 0, margin: 0, fontSize: 14, fontWeight: 400 }}
        >
          {data.name}
        </Paragraph>
      </div>

      {/* Handles for React Flow */}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
    </div>
  );
}
