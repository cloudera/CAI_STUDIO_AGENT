'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Input, Button, Avatar, Layout, Spin, Menu, Dropdown, Tag, Modal, Slider, InputNumber } from 'antd';
import {
  UserOutlined,
  SendOutlined,
  DownloadOutlined,
  ClearOutlined,
  MoreOutlined,
  SettingOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileTextOutlined,
  CodeOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import { useAppDispatch, useAppSelector } from '../lib/hooks/hooks';
import {
  selectWorkflowAppChatUserInput,
  updatedChatUserInput,
} from '../workflows/workflowAppSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import {
  selectWorkflowAppSessionFiles,
  removedSessionFile,
  addedSessionFile,
  setSessionFiles,
} from '@/app/workflows/workflowAppSlice';
import {
  selectWorkflowSessionId,
  selectWorkflowSessionDirectory,
} from '@/app/workflows/editorSlice';
import showdown from 'showdown';
import FileUploadButton from './FileUploadButton';
import ThoughtsBox, { ThoughtEntry } from './workflowApp/ThoughtsBox';
import PlanBox from './workflowApp/PlanBox';
import ArtifactPreviewModal, {
  FileInfo as ArtifactFileInfo,
} from '@/app/components/workflowApp/ArtifactPreviewModal';

const { TextArea } = Input;

interface ChatMessagesProps {
  messages: {
    role: 'user' | 'assistant';
    content: string;
    events?: any[];
    attachments?: { name: string; size?: number }[];
  }[];
  handleTestWorkflow: () => void;
  isProcessing: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  clearMessages: () => void;
  workflowName: string;
  workflow?: any;
  renderMode?: 'studio' | 'workflow';
  onOpenArtifacts?: () => void;
  thoughtSessions?: { id: string; entries: ThoughtEntry[]; collapsed: boolean }[];
  onToggleThoughtSession?: (id: string, next: boolean) => void;
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
  thoughtSessions = [],
  onToggleThoughtSession = () => {},
}) => {
  const userInput = useAppSelector(selectWorkflowAppChatUserInput);
  const sessionFiles = useAppSelector(selectWorkflowAppSessionFiles);
  const _sessionId = useAppSelector(selectWorkflowSessionId);
  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);
  const { data: _workflowData } = useGetWorkflowDataQuery();
  const dispatch = useAppDispatch();
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<ArtifactFileInfo | null>(null);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [fontScalePercent, setFontScalePercent] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('chatFontScalePercent');
        const parsed = stored ? parseInt(stored, 10) : 100;
        if (!Number.isNaN(parsed) && parsed >= 50 && parsed <= 200) return parsed;
      }
    } catch {}
    return 100;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('chatFontScalePercent', String(fontScalePercent));
      }
    } catch {}
  }, [fontScalePercent]);

  const fontScale = Math.max(50, Math.min(200, fontScalePercent)) / 100;

  // Combine artifacts available via Redux session files with server directory listing for robust lookup
  const [availableArtifacts, setAvailableArtifacts] = useState<Record<string, ArtifactFileInfo>>(
    {},
  );
  const availableArtifactsLower = useMemo(() => {
    const m: Record<string, ArtifactFileInfo> = {};
    for (const f of Object.values(availableArtifacts)) {
      if (f?.name) m[f.name.toLowerCase()] = f;
    }
    return m;
  }, [availableArtifacts]);

  useEffect(() => {
    let isActive = true;

    const setFromDir = (dirFiles: ArtifactFileInfo[] = []) => {
      const byName: Record<string, ArtifactFileInfo> = {};
      for (const f of dirFiles) {
        if (f && f.name) byName[f.name] = f;
      }
      if (isActive) setAvailableArtifacts(byName);
    };

    const fetchDir = async () => {
      if (!sessionDirectory) {
        setFromDir();
        return;
      }
      try {
        const res = await fetch(
          `/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDirectory)}`,
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data?.files)) {
          setFromDir(
            data.files.map((f: any) => ({
              name: f.name,
              path: f.path,
              size: f.size ?? 0,
              lastModified: f.lastModified ?? null,
            })),
          );
        } else {
          setFromDir();
        }
      } catch {
        setFromDir();
      }
    };

    fetchDir();
    const id = setInterval(fetchDir, 5000);
    return () => {
      isActive = false;
      clearInterval(id);
    };
  }, [sessionDirectory]);

  const openPreview = (fileName: string) => {
    const match = availableArtifacts[fileName] || availableArtifactsLower[fileName.toLowerCase()];
    if (!match) return;
    setSelectedFile(match);
    setPreviewVisible(true);
  };

  const artifactMapKey = useMemo(() => {
    const entries = Object.values(availableArtifacts)
      .map((f) => `${f.name}:${f.size}`)
      .sort();
    return entries.join('|');
  }, [availableArtifacts]);

  const getFileIcon = (fileName?: string) => {
    const size = 12;
    if (!fileName) return <FileOutlined style={{ color: '#666', fontSize: size }} />;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: size }} />;
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext || ''))
      return <FileImageOutlined style={{ color: '#52c41a', fontSize: size }} />;
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext || ''))
      return <VideoCameraOutlined style={{ color: '#722ed1', fontSize: size }} />;
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext || ''))
      return <AudioOutlined style={{ color: '#fa8c16', fontSize: size }} />;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext || ''))
      return <FileZipOutlined style={{ color: '#faad14', fontSize: size }} />;
    if (
      [
        'py',
        'js',
        'ts',
        'tsx',
        'jsx',
        'java',
        'cpp',
        'c',
        'cs',
        'php',
        'rb',
        'go',
        'rs',
        'swift',
        'kt',
      ].includes(ext || '')
    )
      return <CodeOutlined style={{ color: '#722ed1', fontSize: size }} />;
    if (['html', 'css', 'scss', 'sass', 'less'].includes(ext || ''))
      return <CodeOutlined style={{ color: '#1890ff', fontSize: size }} />;
    if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(ext || ''))
      return <DatabaseOutlined style={{ color: '#1890ff', fontSize: size }} />;
    if (['csv', 'xlsx', 'xls'].includes(ext || ''))
      return <FileExcelOutlined style={{ color: '#52c41a', fontSize: size }} />;
    if (['doc', 'docx', 'rtf'].includes(ext || ''))
      return <FileWordOutlined style={{ color: '#1890ff', fontSize: size }} />;
    if (['log', 'logs'].includes(ext || ''))
      return <FileTextOutlined style={{ color: '#fa8c16', fontSize: size }} />;
    if (['txt', 'md', 'readme'].includes(ext || '') || fileName.toLowerCase().includes('readme'))
      return <FileTextOutlined style={{ color: '#52c41a', fontSize: size }} />;
    return <FileOutlined style={{ color: '#666', fontSize: size }} />;
  };

  // rehype plugin to replace file-like text and links with artifact buttons
  const artifactButtonRehype = useMemo(() => {
    // Avoid lookbehind for cross-browser support; simple word boundary matching
    const FILE_LIKE = /\b[\w()_\-\s]+\.[A-Za-z0-9]{1,10}\b/g;

    const resolveName = (name: string) => {
      if (!name) return null;
      const exact = availableArtifacts[name];
      if (exact) return exact.name;
      const lower = availableArtifactsLower[name.toLowerCase()];
      return lower ? lower.name : null;
    };

    const transformText = (node: any, index: number, parent: any) => {
      const value: string = node.value;
      FILE_LIKE.lastIndex = 0;
      const parts: any[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = FILE_LIKE.exec(value)) !== null) {
        const [full] = match;
        const start = match.index;
        const end = start + full.length;
        if (start > lastIndex) parts.push({ type: 'text', value: value.slice(lastIndex, start) });
        const resolved = resolveName(full);
        if (resolved) {
          parts.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['artifact-inline-button'],
              'data-filename': resolved,
              style:
                'display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:1px solid #e8e8e8;border-radius:12px;background:#fafafa;color:#000;font-size:12px;cursor:pointer;',
            },
            children: [{ type: 'text', value: resolved }],
          });
        } else {
          parts.push({ type: 'text', value: full });
        }
        lastIndex = end;
      }
      if (parts.length) {
        if (lastIndex < value.length) parts.push({ type: 'text', value: value.slice(lastIndex) });
        parent.children.splice(index, 1, ...parts);
      }
    };

    return () => (tree: any) => {
      // Replace <a> nodes that point to artifact filenames (by link text or last path segment)
      visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
        if (!parent || typeof index !== 'number') return;
        if (node.tagName === 'a') {
          const href: string | undefined = node.properties?.href;
          let label = '';
          if (
            Array.isArray(node.children) &&
            node.children.length === 1 &&
            node.children[0].type === 'text'
          ) {
            label = String(node.children[0].value || '').trim();
          }
          let candidate = label;
          if (!candidate && href) {
            try {
              const parts = href.split('/');
              candidate = parts[parts.length - 1] || '';
            } catch {}
          }
          const resolved = resolveName(candidate);
          if (resolved) {
            parent.children[index] = {
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['artifact-inline-button'],
                'data-filename': resolved,
                style:
                  'display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:1px solid #e8e8e8;border-radius:12px;background:#fafafa;color:#000;font-size:12px;cursor:pointer;',
              },
              children: [{ type: 'text', value: resolved }],
            };
          }
        } else if (node.tagName === 'code') {
          if (
            Array.isArray(node.children) &&
            node.children.length === 1 &&
            node.children[0].type === 'text'
          ) {
            const txt = String(node.children[0].value || '').trim();
            const resolved = resolveName(txt);
            if (resolved) {
              parent.children[index] = {
                type: 'element',
                tagName: 'span',
                properties: {
                  className: ['artifact-inline-button'],
                  'data-filename': resolved,
                  style:
                    'display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:1px solid #e8e8e8;border-radius:12px;background:#fafafa;color:#000;font-size:12px;cursor:pointer;',
                },
                children: [{ type: 'text', value: resolved }],
              };
            }
          }
        }
      });

      // Replace plain text occurrences (skip pre/script/style)
      visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
        if (!node.value || typeof node.value !== 'string') return;
        if (typeof index !== 'number' || !parent || !Array.isArray(parent.children)) return;
        if (parent.type === 'element' && ['pre', 'script', 'style'].includes(parent.tagName))
          return;
        transformText(node, index, parent);
      });
    };
  }, [availableArtifacts, availableArtifactsLower]);

  // Local attachment state for conversational view with individual file tracking
  const [fileStates, setFileStates] = useState<{
    [fileName: string]: {
      name: string;
      size: number;
      status: 'pending' | 'uploading' | 'completed' | 'failed';
    };
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
        <ClearOutlined className="mr-2" />
        Clear Chat
      </Menu.Item>
      <Menu.Item key="download" onClick={handleDownloadLogs}>
        <DownloadOutlined className="mr-2" />
        Log Bundle
      </Menu.Item>
      <Menu.Item key="settings" onClick={() => setSettingsVisible(true)}>
        <SettingOutlined className="mr-2" />
        Chat setting
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
    if (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif')
    ) {
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
      <ArtifactPreviewModal
        visible={previewVisible}
        file={selectedFile}
        onClose={() => setPreviewVisible(false)}
      />
      <Modal
        open={settingsVisible}
        title="Chat Settings"
        onCancel={() => setSettingsVisible(false)}
        onOk={() => setSettingsVisible(false)}
        okText="Close"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 140 }}>Font Size (%)</div>
          <Slider
            min={50}
            max={200}
            step={5}
            value={fontScalePercent}
            onChange={(v) => setFontScalePercent(Array.isArray(v) ? v[0] : (v as number))}
            style={{ flex: 1 }}
          />
          <InputNumber
            min={50}
            max={200}
            value={fontScalePercent}
            onChange={(v) => setFontScalePercent(typeof v === 'number' ? v : 100)}
          />
        </div>
      </Modal>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          marginBottom: '16px',
          position: 'relative',
          zoom: fontScale,
        }}
      >
        {messages.length === 0 && (
          <div className="flex justify-center items-center h-full text-[#d9d9d9] text-2xl font-extralight">
            Say Hello
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className="flex items-start mb-3">
            <Avatar
              icon={<UserOutlined />}
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
              <div className="flex items-center gap-2">
                <span>{message.content}</span>
                <Spin size="small" />
              </div>
            ) : message.role === 'assistant' ? (
              <Layout
                className="bg-white relative"
                style={{
                  overflowX: 'hidden',
                  border: '1px solid #e8e8e8',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                  borderRadius: 6,
                  width: '100%',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadPdf(message.content)}
                  className="absolute bottom-4 right-4 bg-white shadow rounded-full w-6 h-6 flex items-center justify-center border-none"
                />
                <div
                  className="prose prose-lg max-w-none m-4"
                  style={{
                    fontSize: '12px',
                    padding: '0px',
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    overflowX: 'hidden',
                  }}
                >
                  <ReactMarkdown
                    key={artifactMapKey}
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, artifactButtonRehype]}
                    components={{
                      span: ({ node, ...props }) => {
                        const propsAny = props as any;
                        if (
                          propsAny &&
                          propsAny['data-filename'] &&
                          propsAny.className?.toString().includes('artifact-inline-button')
                        ) {
                          const fileName = propsAny['data-filename'] as string;
                          const exists = !!availableArtifacts[fileName];
                          if (!exists) return <span {...props} />;
                          return (
                            <button
                              onClick={() => openPreview(fileName)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '2px 6px',
                                height: 22,
                                border: '1px solid #e8e8e8',
                                borderRadius: 12,
                                background: '#fafafa',
                                color: '#000',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {getFileIcon(fileName)}
                              </span>
                              <span
                                style={{
                                  maxWidth: 200,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {fileName}
                              </span>
                            </button>
                          );
                        }
                        return <span {...props} />;
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </Layout>
            ) : (
              <div
                style={{
                  background: 'transparent',
                  maxWidth: '100%',
                  position: 'relative',
                  paddingTop: '2px',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    padding: 0,
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: '#000',
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {message.content}
                </div>
                {message.attachments && message.attachments.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      padding: '4px 0 0 0',
                    }}
                  >
                    {message.attachments.map((f, i) => {
                      const meta = getAttachmentMeta(f.name);
                      return (
                        <Tag key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{meta.emoji}</span>
                          <span
                            style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {f.name}
                          </span>
                          {typeof f.size === 'number' && (
                            <span style={{ opacity: 0.8 }}>{(f.size / 1024).toFixed(1)} KB</span>
                          )}
                          <span style={{ opacity: 0.7 }}>{meta.label}</span>
                        </Tag>
                      );
                    })}
                  </div>
                )}
                {/* per-user-turn thoughts box */}
                {(() => {
                  // Find matching thought session for this user turn (index among user messages)
                  if (message.role !== 'user') return null;
                  const userIndex =
                    messages.slice(0, index + 1).filter((m) => m.role === 'user').length - 1;
                  const session = thoughtSessions[userIndex];
                  if (!session) return null;
                  return (
                    <div style={{ marginTop: 8, width: '100%', minWidth: 0 }}>
                      <PlanBox
                        active={isProcessing && userIndex === thoughtSessions.length - 1}
                        sessionKey={session.id}
                        isCollapsed={session.collapsed}
                        onToggle={(next) => onToggleThoughtSession(session.id, next)}
                      />
                      <ThoughtsBox
                        entries={session.entries}
                        isCollapsed={session.collapsed}
                        onToggle={(next) => onToggleThoughtSession(session.id, next)}
                        active={isProcessing && userIndex === thoughtSessions.length - 1}
                        sessionKey={session.id}
                        // Provide artifacts captured server-side in parent state if present
                        // @ts-ignore - prop may be unused in this component but accepted by ThoughtsBox via spread
                        artifacts={session.artifacts}
                      />
                    </div>
                  );
                })()}
              </div>
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
                color={
                  fileState.status === 'uploading'
                    ? 'blue'
                    : fileState.status === 'failed'
                      ? 'red'
                      : 'default'
                }
                closable={true}
                onClose={async (e) => {
                  e.preventDefault();
                  // Remove from UI immediately
                  setFileStates((prev) => {
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
                    if (sessionDirectory) {
                      const filePath = `${sessionDirectory}/${fileState.name}`;
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
                <span role="img" aria-label="file">
                  📄
                </span>
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fileState.name}
                </span>
                <span style={{ opacity: 0.8 }}>{(fileState.size / 1024).toFixed(1)} KB</span>
                {fileState.status === 'uploading' && (
                  <Spin size="small" style={{ marginLeft: 4 }} />
                )}
                {fileState.status === 'failed' && (
                  <span style={{ color: 'red', marginLeft: 4 }}>✗</span>
                )}
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
                if (sessionDirectory) {
                  const filePath = `${sessionDirectory}/${f.name}`;
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
              <span role="img" aria-label="file">
                📄
              </span>
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name}
              </span>
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
          className="flex-1 mr-2"
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
            setFileStates((prev) => {
              const newStates = { ...prev };
              files.forEach((f) => {
                newStates[f.name] = { name: f.name, size: f.size, status: 'uploading' };
              });
              return newStates;
            });
          }}
          onFileUploaded={(file, success) => {
            const wasCanceled = canceledUploadsRef.current.has(file.name);
            setFileStates((prev) => {
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
              if (success && sessionDirectory) {
                const filePath = `${sessionDirectory}/${file.name}`;
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
          className="mr-2"
        />
        <Dropdown overlay={menu} trigger={['click']} placement="bottomRight">
          <Button icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    </>
  );
};

export default ChatMessages;
