import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Avatar, Layout, Typography, Button, Tooltip } from 'antd';
import { FileDoneOutlined, UserOutlined, EditOutlined } from '@ant-design/icons';
import { BaseNode } from '@/components/base-node';
import { AgentMetadata, CrewAITaskMetadata } from '@/studio/proto/agent_studio';

const { Text, Paragraph } = Typography;

type TaskNode = Node<
  {
    name: string;
    active: boolean;
    isMostRecent?: boolean;
    taskId?: string; // Add task ID for edit functionality
    taskData?: CrewAITaskMetadata; // Add full task data
    onEditTask?: (task: CrewAITaskMetadata) => void; // Add callback for task edit
    isConversational?: boolean; // Add flag for conversational workflow
  },
  'task'
>;

export default function TaskNode({ data }: NodeProps<TaskNode>) {
  const [isHovered, setIsHovered] = useState(false);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onEditTask && data.taskData) {
      data.onEditTask(data.taskData);
    }
  };

  return (
    <div className="task-node">
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
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
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          border: isHovered ? '2px solid rgb(3, 149, 46)' : '2px solid rgba(0,0,0,0)',
          animation: data.active ? 'pulse-in-out 1.0s infinite ease-in-out' : 'none',
          maxWidth: 200,
          backgroundColor: 'lightgreen',
        }}
      >
        {/* Edit Button - Show for all task nodes except conversational workflows */}
        {data.taskData && data.onEditTask && !data.isConversational && (
          <Tooltip title="Edit Task">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: 'white' }} />}
              size="small"
              onClick={handleEditClick}
              style={{
                position: 'absolute',
                bottom: -10, // Position on bottom-right
                right: -10,
                zIndex: 10,
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#26bd67', // Match task icon background color
                border: '2px solid #26bd67', // Match background color
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                minWidth: 'auto',
              }}
            />
          </Tooltip>
        )}

        {/* Ant Design Avatar */}
        <Avatar
          style={{
            position: 'absolute',
            top: -24,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', // Optional shadow for floating look,
            backgroundColor: '#26bd67',
          }}
          size={36}
          icon={<FileDoneOutlined />}
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
      </div>
    </div>
  );
}
