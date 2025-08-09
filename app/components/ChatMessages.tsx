'use client';

import React, { useMemo, useState } from 'react';
import { Input, Button, Avatar, Layout, Spin, Tooltip, Menu, Dropdown, Tag } from 'antd';
import {
  UserOutlined,
  RobotOutlined,
  SendOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  ClearOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useAppDispatch, useAppSelector } from '../lib/hooks/hooks';
import {
  selectWorkflowAppChatUserInput,
  updatedChatUserInput,
} from '../workflows/workflowAppSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { getWorkflowDirectory } from '@/app/lib/workflowFileUpload';
import { selectWorkflowAppSessionFiles, removedSessionFile, addedSessionFile, setSessionFiles } from '@/app/workflows/workflowAppSlice';
import { selectWorkflowSessionId } from '@/app/workflows/editorSlice';
import showdown from 'showdown';
import FileUploadButton from './FileUploadButton';

const { TextArea } = Input;

interface ChatMessagesProps {
  messages: { role: 'user' | 'assistant'; content: string; events?: any[]; attachments?: { name: string; size?: number }[] }[];
  handleTestWorkflow: () => void;
  isProcessing: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  clearMessages: () => void;
  workflowName: string;
  workflow?: any;
  renderMode?: 'studio' | 'workflow';
  onOpenArtifacts?: () => void;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  handleTestWorkflow,
  isProcessing,
  messagesEndRef,
  clearMessages,
  workflowName,
  workflow,
  renderMode = 'studio',
  onOpenArtifacts,
}) => {
  const userInput = useAppSelector(selectWorkflowAppChatUserInput);
  const sessionFiles = useAppSelector(selectWorkflowAppSessionFiles);
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const { data: workflowData } = useGetWorkflowDataQuery();
  const dispatch = useAppDispatch();

  // Local attachment state for conversational view with individual file tracking
  const [fileStates, setFileStates] = useState<{ 
    [fileName: string]: { 
      name: string; 
      size: number; 
      status: 'pending' | 'uploading' | 'completed' | 'failed' 
    } 
  }>({});
  // Track files user canceled while uploading to prevent re-adding on completion
  const canceledUploadsRef = React.useRef<Set<string>>(new Set());

  const handleDownloadPdf = async (content: string) => {
    try {
      // Dynamically import html2pdf
      const html2pdf = (await import('html2pdf.js')).default;

      const converter = new showdown.Converter({
        tables: true,
        tasklists: true,
        strikethrough: true,
        emoji: true,
      });

      const html = converter.makeHtml(content);

      // Create a temporary container with styles
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.padding = '20px';
      container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial';
      container.style.fontSize = '12px';
      container.style.lineHeight = '1.5';
      container.style.color = '#000';

      // Add CSS styles for markdown elements
      const style = document.createElement('style');
      style.textContent = `
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        p { margin-bottom: 16px; }
        code { background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; }
        pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; margin-left: 0; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
        img { max-width: 100%; height: auto; }
        ul, ol { padding-left: 20px; margin-bottom: 16px; }
      `;
      container.appendChild(style);

      // Configure PDF options
      const opt = {
        margin: [10, 10],
        filename: 'chat-message.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };

      // Generate PDF
      await html2pdf().from(container).set(opt).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleDownloadLogs = () => {
    // Construct a single JSON payload
    const chatPairsWithEvents = [];
    let lastUser = null;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        lastUser = msg.content;
      } else if (msg.role === 'assistant') {
        chatPairsWithEvents.push({
          User: lastUser,
          Assistant: msg.content,
          events: msg.events || [],
        });
      }
    }
    const fileName = `${workflowName || 'chat_log'}.json`;
    const blob = new Blob([JSON.stringify(chatPairsWithEvents, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const menu = (
    <Menu>
      <Menu.Item key="clear" onClick={clearMessages}>
        <ClearOutlined style={{ marginRight: 8 }} />
        Clear Chat
      </Menu.Item>
      <Menu.Item key="download" onClick={handleDownloadLogs}>
        <DownloadOutlined style={{ marginRight: 8 }} />
        Log Bundle
      </Menu.Item>
    </Menu>
  );

  const getAttachmentMeta = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return { label: 'Spreadsheet', emoji: '🟩' };
    }
    if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
      return { label: 'Presentation', emoji: '🟧' };
    }
    if (lower.endsWith('.pdf')) {
      return { label: 'PDF', emoji: '🟥' };
    }
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif')) {
      return { label: 'Image', emoji: '🖼️' };
    }
    return { label: 'File', emoji: '📄' };
  };

  const handleSend = async () => {
    try {
      await Promise.resolve(handleTestWorkflow());
    } finally {
      // Move attachments into the message; clear the composer chips
      setFileStates({});
      dispatch(setSessionFiles([]));
    }
  };

  return (
    <>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px',
          position: 'relative',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: '#d9d9d9',
              fontSize: '24px',
              fontWeight: 'lighter',
            }}
          >
            Say Hello
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              marginBottom: '12px',
            }}
          >
            <Avatar
              icon={message.role === 'user' ? <UserOutlined /> : <UserOutlined />}
              style={{
                marginRight: '8px',
                backgroundColor: message.role === 'user' ? '#87d068' : '#1890ff',
                width: '25px',
                height: '25px',
                minWidth: '25px',
                minHeight: '25px',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
            {message.role === 'assistant' && message.content.includes('is thinking') ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{message.content}</span>
                <Spin size="small" />
              </div>
            ) : message.role === 'assistant' ? (
              <Layout
                style={{
                  background: '#fff',
                  borderRadius: '8px',
                  maxWidth: '95%',
                  position: 'relative',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadPdf(message.content)}
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    right: '16px',
                    background: 'white',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                  }}
                />
                <div
                  className="prose prose-lg max-w-none m-4"
                  style={{
                    fontSize: '12px',
                    padding: '0px',
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              </Layout>
            ) : (
              <Layout
                style={{
                  background: '#fff',
                  maxWidth: '95%',
                  position: 'relative',
                }}
              >
                <div style={{ padding: '12px' }}>{message.content}</div>
                {message.attachments && message.attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 12px 12px 12px' }}>
                    {message.attachments.map((f, i) => {
                      const meta = getAttachmentMeta(f.name);
                      return (
                        <Tag key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{meta.emoji}</span>
                          <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                          {typeof f.size === 'number' && (
                            <span style={{ opacity: 0.8 }}>{(f.size / 1024).toFixed(1)} KB</span>
                          )}
                          <span style={{ opacity: 0.7 }}>{meta.label}</span>
                        </Tag>
                      );
                    })}
                  </div>
                )}
              </Layout>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment chips just above the message box */}
      {(Object.keys(fileStates).length > 0 || (sessionFiles && sessionFiles.length > 0)) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 8px 0' }}>
          {Object.values(fileStates)
            .filter((fs) => fs.status !== 'completed')
            .map((fileState) => (
            <Tag
              key={fileState.name}
              color={fileState.status === 'uploading' ? 'blue' : fileState.status === 'failed' ? 'red' : 'default'}
              closable={true}
              onClose={async (e) => {
                e.preventDefault();
                // Remove from UI immediately
                setFileStates(prev => {
                  const newStates = { ...prev };
                  delete newStates[fileState.name];
                  return newStates;
                });

                // Mark as canceled if still uploading to prevent re-adding on completion
                if (fileState.status === 'uploading') {
                  canceledUploadsRef.current.add(fileState.name);
                  // Try to cancel the in-flight request via upload hook if available
                  try {
                    // Soft import to avoid tight coupling
                    // @ts-ignore
                    if (typeof window !== 'undefined' && window.__cancelUpload) {
                      // @ts-ignore
                      window.__cancelUpload(fileState.name);
                    }
                  } catch {}
                }

                // Background deletion for completed files
                if (fileState.status === 'completed') {
                  const workflowDirectory = getWorkflowDirectory(renderMode, workflow, workflowData);
                  if (sessionId && workflowDirectory) {
                    const filePath = `${workflowDirectory}/session/${sessionId}/${fileState.name}`;
                    try {
                      await fetch('/api/file/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath }),
                      });
                    } catch (err) {
                      console.error('Background delete error:', err);
                    }
                  }
                  dispatch(removedSessionFile(fileState.name));
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span role="img" aria-label="file">📄</span>
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileState.name}</span>
              <span style={{ opacity: 0.8 }}>{(fileState.size / 1024).toFixed(1)} KB</span>
              {fileState.status === 'uploading' && <Spin size="small" style={{ marginLeft: 4 }} />}
              {fileState.status === 'failed' && <span style={{ color: 'red', marginLeft: 4 }}>✗</span>}
            </Tag>
          ))}
          {sessionFiles?.map((f, idx) => (
            <Tag
              key={`uploaded-${idx}`}
              closable
              onClose={async (e) => {
                e.preventDefault();
                // Remove from UI immediately
                dispatch(removedSessionFile(f.name));

                // Background deletion
                const workflowDirectory = getWorkflowDirectory(renderMode, workflow, workflowData);
                if (sessionId && workflowDirectory) {
                  const filePath = `${workflowDirectory}/session/${sessionId}/${f.name}`;
                  try {
                    await fetch('/api/file/delete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ filePath }),
                    });
                  } catch (err) {
                    console.error('Background delete error:', err);
                  }
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span role="img" aria-label="file">📄</span>
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              <span style={{ opacity: 0.8 }}>{(f.size / 1024).toFixed(1)} KB</span>
            </Tag>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: 'auto',
        }}
      >
        <TextArea
          placeholder="Type your message"
          autoSize={{ minRows: 1, maxRows: 10 }}
          value={userInput}
          onChange={(e) => dispatch(updatedChatUserInput(e.target.value))}
          onPressEnter={handleTestWorkflow}
          style={{ flex: 1, marginRight: '8px' }}
          disabled={isProcessing}
        />
        <FileUploadButton
          workflow={workflow}
          renderMode={renderMode}
          buttonType="chat"
          disabled={isProcessing}
          onUploadSuccess={onOpenArtifacts}
          onFilesAdded={(files) => {
            // Add files to pending state
            setFileStates(prev => {
              const newStates = { ...prev };
              files.forEach(f => {
                newStates[f.name] = { name: f.name, size: f.size, status: 'uploading' };
              });
              return newStates;
            });
          }}
          onFileUploaded={(file, success) => {
            const wasCanceled = canceledUploadsRef.current.has(file.name);
            setFileStates(prev => {
              const newStates = { ...prev };
              if (newStates[file.name]) {
                if (success) {
                  // On success, remove from local state to avoid duplicate with sessionFiles
                  delete newStates[file.name];
                } else {
                  newStates[file.name].status = 'failed';
                }
              }
              return newStates;
            });
            if (wasCanceled) {
              canceledUploadsRef.current.delete(file.name);
              // If upload eventually succeeded but user canceled, delete on server in background
              const workflowDirectory = getWorkflowDirectory(renderMode, workflow, workflowData);
              if (success && sessionId && workflowDirectory) {
                const filePath = `${workflowDirectory}/session/${sessionId}/${file.name}`;
                fetch('/api/file/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filePath }),
                }).catch(() => {});
              }
              return;
            }
            if (success) dispatch(addedSessionFile({ name: file.name, size: file.size }));
          }}
          style={{ marginRight: '8px' }}
        />
        <Button
          type="primary"
          icon={isProcessing ? <Spin size="small" /> : <SendOutlined />}
          onClick={handleSend}
          disabled={isProcessing}
          style={{ marginRight: '8px' }}
        />
        <Dropdown overlay={menu} trigger={['click']} placement="bottomRight">
          <Button icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    </>
  );
};

export default ChatMessages;
