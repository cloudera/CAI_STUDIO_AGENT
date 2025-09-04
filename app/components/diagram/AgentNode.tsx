import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeToolbar } from '@xyflow/react';
import { Avatar, Image, Typography, Button, Tooltip } from 'antd';
import { UsergroupAddOutlined, UserOutlined, EditOutlined } from '@ant-design/icons';
import { useAppDispatch } from '@/app/lib/hooks/hooks';
import {
  updatedEditorAgentViewOpen,
  updatedEditorAgentViewStep,
  updatedEditorAgentViewAgent,
} from '@/app/workflows/editorSlice';
import { AgentMetadata } from '@/studio/proto/agent_studio';
import { useWorkflowDiagramContext } from '../workflowApp/WorkflowDiagram';

const { Paragraph } = Typography;

const infoMessages = {
  LLMCall: 'Calling LLM...',
  ToolOutput: 'Tool Use Complete...',
  ToolInput: 'Using Tool...',
  TaskStart: 'Starting a Task...',
  Completion: 'Thinking...',
  FailedCompletion: 'Failed LLM Call...',
  Delegate: 'Delegating...',
  EndDelegate: 'Done Delegating...',
  AskCoworker: 'Asking a coworker...',
  EndAskCoworker: 'Done Asking a coworker...',
};

type AgentNode = Node<
  {
    name: string;
    iconData: string;
    manager: boolean;
    active: boolean;
    info?: string;
    infoType?: string;
    isMostRecent?: boolean;
    agentId?: string; // Add agent ID for edit functionality
    agentData?: AgentMetadata; // Add full agent data
    isDefaultManager?: boolean; // Add flag for default manager
    showEditButton?: boolean; // Control whether to show edit button
  },
  'agent'
>;

export default function AgentNode({ data }: NodeProps<AgentNode>) {
  const [isHovered, setIsHovered] = useState(false);
  const dispatch = useAppDispatch();
  const { onEditManager } = useWorkflowDiagramContext();

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.agentData) {
      dispatch(updatedEditorAgentViewOpen(true));
      dispatch(updatedEditorAgentViewStep('Select'));
      dispatch(updatedEditorAgentViewAgent(data.agentData));
    }
  };

  const handleEditManagerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // For manager agents, we need to open the manager modal
    // This will be handled by the parent component through a callback
    if (onEditManager && data.agentData) {
      onEditManager(data.agentData);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '16px',
        background: '#f3f3f3',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        border: isHovered ? '2px solid #007bff' : '2px solid rgba(0,0,0,0)',
        animation: data.active ? 'pulse-in-out 1.0s infinite ease-in-out' : 'none',
        maxWidth: 200,
        backgroundColor: data.manager ? 'white' : 'lightblue',
      }}
    >
      {/* Edit Button - Show for non-manager agents */}
      {!data.manager && data.agentData && data.showEditButton !== false && (
        <Tooltip title="Edit Agent">
          <Button
            type="text"
            icon={<EditOutlined style={{ color: 'white' }} />}
            size="small"
            onClick={handleEditClick}
            style={{
              position: 'absolute',
              bottom: -10, // Move to bottom right
              right: -10,
              zIndex: 10,
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#78b2ff',
              border: '2px solid #78b2ff',
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

      {/* Edit Button - Show for custom manager agents (not default) */}
      {data.manager &&
        data.agentData &&
        !data.isDefaultManager &&
        data.showEditButton !== false && (
          <Tooltip title="Edit Manager Agent">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: 'white' }} />}
              size="small"
              onClick={handleEditManagerClick}
              style={{
                position: 'absolute',
                bottom: -10, // Move to bottom right
                right: -10,
                zIndex: 10,
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'lightgrey',
                border: '2px solid lightgrey',
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

      {data.info && (
        <>
          <NodeToolbar
            isVisible={true}
            className="rounded-sm p-2 text-primary-foreground"
            position={Position.Top}
            tabIndex={1}
            style={{
              maxWidth: 500,
              opacity: 0.8,
              backgroundColor: '#78b2ff',
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
              {isHovered
                ? data.info
                : (data?.infoType && infoMessages[data.infoType as keyof typeof infoMessages]) ||
                  'Unknown...'}
            </Paragraph>
          </NodeToolbar>
        </>
      )}

      <Avatar
        style={{
          position: 'absolute',
          left: -30, // Position avatar overlapping to the left
          top: -30,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', // Optional shadow for floating look
          backgroundColor: data.manager ? 'lightgrey' : data.iconData ? '#b8d6ff' : '#78b2ff', // or lightblue
          padding: data.manager ? 0 : data.iconData ? 8 : 0,
        }}
        size={48}
        icon={
          data.manager ? (
            <UsergroupAddOutlined />
          ) : data.iconData ? (
            <Image src={data.iconData} alt={data.name} />
          ) : (
            <UserOutlined />
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
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
}
