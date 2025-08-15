import React from 'react';
import { Card, Tag, Button, Tooltip, Modal, Spin, Typography } from 'antd';
import {
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
  RightOutlined,
  DownOutlined,
  EyeOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectWorkflowSessionDirectory } from '@/app/workflows/editorSlice';

export interface ThoughtEntry {
  id: string;
  timestamp?: string;
  thought: string;
  tool?: string;
  coworker?: string;
}

interface ThoughtsBoxProps {
  entries: ThoughtEntry[];
  isCollapsed: boolean;
  onToggle: (next: boolean) => void;
  style?: React.CSSProperties;
  active?: boolean;
  sessionKey?: string;
  artifacts?: { name: string; path: string; size: number; lastModified: string | null }[];
}

const ThoughtsBox: React.FC<ThoughtsBoxProps> = ({
  entries,
  isCollapsed,
  onToggle,
  style,
  active = true,
  sessionKey,
  artifacts,
}) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isCollapsed && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, isCollapsed]);

  // Artifacts state and helpers
  interface FileInfo {
    name: string;
    path: string;
    size: number;
    lastModified: string | null;
  }
  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);
  const [files, setFiles] = React.useState<FileInfo[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const initialPathsRef = React.useRef<Set<string>>(new Set());
  const artifactsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = React.useState<{
    visible: boolean;
    file: FileInfo | null;
    blobUrl: string | null;
    content: string | null;
    loading: boolean;
    error: string | null;
  }>({ visible: false, file: null, blobUrl: null, content: null, loading: false, error: null });

  React.useEffect(() => {
    if (!isCollapsed && artifactsScrollRef.current) {
      artifactsScrollRef.current.scrollTop = artifactsScrollRef.current.scrollHeight;
    }
  }, [files, artifacts, isCollapsed]);

  const getFileIcon = (fileName?: string) => {
    const size = 11; // ~70% of 16px
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

  const fetchFiles = React.useCallback(async () => {
    // If parent provides artifacts, do not fetch; display only provided list
    if (artifacts !== undefined) return;
    if (!sessionDirectory) return;
    try {
      if (active) setLoading(false); // do not show spinner per requirement
      const response = await fetch(
        `/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDirectory)}`,
      );
      const data = await response.json();
      if (response.ok && Array.isArray(data.files)) {
        const valid = data.files.filter((f: FileInfo) => f && f.name && typeof f.name === 'string');
        if (initialPathsRef.current.size === 0) {
          // capture baseline at first fetch
          initialPathsRef.current = new Set(valid.map((f: FileInfo) => f.path || f.name));
          // Do not mutate existing files; baseline only
        } else {
          const baseline = initialPathsRef.current;
          const delta = valid.filter((f: FileInfo) => !baseline.has(f.path || f.name));
          // Merge new deltas with existing files, dedup by path/name
          setFiles((prev) => {
            const known = new Set(prev.map((f) => f.path || f.name));
            const merged = [...prev];
            for (const f of delta) {
              const key = f.path || f.name;
              if (!known.has(key)) {
                known.add(key);
                merged.push(f);
              }
            }
            return merged;
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionDirectory, active, artifacts]);

  React.useEffect(() => {
    if (artifacts !== undefined) return;
    if (active) fetchFiles();
  }, [fetchFiles, active, artifacts]);

  React.useEffect(() => {
    if (artifacts !== undefined) return;
    if (!sessionDirectory || !active) return;
    const id = setInterval(() => fetchFiles(), 5000);
    return () => clearInterval(id);
  }, [sessionDirectory, fetchFiles, active, artifacts]);

  // When active flag toggles from false->true (new run), reset baseline and files
  const prevActiveRef = React.useRef<boolean>(active);
  React.useEffect(() => {
    if (artifacts !== undefined) return;
    if (!prevActiveRef.current && active) {
      initialPathsRef.current = new Set();
      setFiles([]);
      fetchFiles();
    }
    prevActiveRef.current = active;
  }, [active, fetchFiles, artifacts]);

  // When a new sessionKey is provided (new Thoughts box instance), reset baseline
  React.useEffect(() => {
    if (artifacts !== undefined) return;
    if (!sessionKey) return;
    initialPathsRef.current = new Set();
    setFiles([]);
    if (active) fetchFiles();
  }, [sessionKey, artifacts]);

  const isTextBasedFile = (fileName: string): boolean => {
    const textExt = [
      'txt',
      'log',
      'md',
      'json',
      'py',
      'js',
      'ts',
      'tsx',
      'jsx',
      'css',
      'html',
      'xml',
      'yaml',
      'yml',
      'ini',
      'conf',
      'config',
      'csv',
      'sql',
      'java',
      'cpp',
      'c',
      'h',
      'cs',
      'php',
      'rb',
      'go',
      'rs',
      'sh',
    ];
    const ext = fileName.split('.').pop()?.toLowerCase();
    return textExt.includes(ext || '');
  };

  const getFileType = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '')) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext || '')) return 'audio';
    if (isTextBasedFile(fileName)) return 'text';
    return 'binary';
  };

  const previewFile = async (file: FileInfo) => {
    setPreview({ visible: true, file, blobUrl: null, content: null, loading: true, error: null });
    try {
      const downloadUrl = `/api/file/download?filePath=${encodeURIComponent(file.path)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to download file');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      let content: string | null = null;
      if (getFileType(file.name) === 'text' && blob.size < 10 * 1024 * 1024) {
        try {
          content = await blob.text();
        } catch {}
      }
      setPreview((p) => ({ ...p, blobUrl, content, loading: false }));
    } catch (e: any) {
      setPreview((p) => ({ ...p, loading: false, error: e?.message || 'Failed to preview file' }));
    }
  };

  const closePreview = () => {
    if (preview.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    setPreview({
      visible: false,
      file: null,
      blobUrl: null,
      content: null,
      loading: false,
      error: null,
    });
  };

  const renderPreview = () => {
    const file = preview.file;
    if (!file || !preview.blobUrl) return null;
    const type = getFileType(file.name);
    if (type === 'image')
      return <img src={preview.blobUrl} style={{ maxWidth: '100%', maxHeight: '60vh' }} />;
    if (type === 'pdf')
      return <embed src={preview.blobUrl} type="application/pdf" width="100%" height="60vh" />;
    if (type === 'video')
      return (
        <video controls style={{ maxWidth: '100%', maxHeight: '60vh' }}>
          <source src={preview.blobUrl} />
        </video>
      );
    if (type === 'audio')
      return (
        <audio controls style={{ width: '100%' }}>
          <source src={preview.blobUrl} />
        </audio>
      );
    if (type === 'text')
      return (
        <pre
          style={{
            backgroundColor: '#f5f5f5',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            padding: 12,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontSize: 12,
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          {preview.content}
        </pre>
      );
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <FileOutlined style={{ fontSize: 36, color: '#d9d9d9' }} />
        <div>Binary file preview not available.</div>
      </div>
    );
  };

  return (
    <Card
      size="small"
      bodyStyle={{ padding: 8 }}
      style={{
        backgroundColor: 'rgba(0,0,0,0.65)',
        backgroundImage:
          'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)',
        borderRadius: 6,
        width: '100%',
        ...style,
      }}
    >
      <style>
        {`
        @keyframes thoughtsbox-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .thoughtsbox-shimmer-text {
          background: linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.2) 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: thoughtsbox-shimmer 1.8s linear infinite;
        }
        `}
      </style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          onClick={() => onToggle(!isCollapsed)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#fff' }}
        >
          {isCollapsed ? (
            <RightOutlined style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }} />
          ) : (
            <DownOutlined style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }} />
          )}
          <div
            className={active ? 'thoughtsbox-shimmer-text' : undefined}
            style={{
              fontSize: 11,
              fontWeight: 600,
              opacity: 0.95,
              color: active ? 'transparent' : '#fff',
            }}
          >
            Thoughts
          </div>
        </div>
        <span style={{ fontSize: 10, opacity: 0.8, color: '#ddd' }}>{entries.length}</span>
      </div>
      {!isCollapsed && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {/* Left: thoughts 80% */}
          <div
            ref={listRef}
            style={{
              flexBasis: '80%',
              maxHeight: 160,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {entries.length === 0 && (
              <div style={{ fontSize: 10, opacity: 0.8, color: '#ddd' }}>No thoughts yet…</div>
            )}
            {entries.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, lineHeight: 1.4, whiteSpace: 'pre-wrap', color: '#fff' }}>
                  {entry.thought}
                </div>
                {entry.tool && (
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 10, opacity: 0.7, marginRight: 4, color: '#ccc' }}>
                      Using Tool
                    </span>
                    <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', height: 18 }}>
                      {entry.tool}
                    </Tag>
                  </div>
                )}
                {entry.coworker && (
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 10, opacity: 0.7, marginRight: 4, color: '#ccc' }}>
                      Using Coworker
                    </span>
                    <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', height: 18 }}>
                      {entry.coworker}
                    </Tag>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Vertical divider */}
          <div style={{ width: 1, background: '#333' }} />
          {/* Right: artifacts 20% */}
          <div style={{ flexBasis: '20%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, opacity: 0.9, color: '#eee' }}>Artifacts</div>
            {((artifacts && artifacts.length > 0) || files.length > 0) && (
              <div
                ref={artifactsScrollRef}
                style={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  paddingRight: 4,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {(artifacts && artifacts.length > 0 ? artifacts : files).map((f) => (
                  <Tooltip key={f.path} title={f.name} placement="top">
                    <Button
                      type="default"
                      size="small"
                      icon={getFileIcon(f.name)}
                      onClick={() => previewFile(f)}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          marginLeft: 4,
                          maxWidth: 90,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {f.name}
                      </span>
                    </Button>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={preview.visible}
        onCancel={closePreview}
        title={preview.file?.name || 'Artifact'}
        footer={[
          <Button
            key="download"
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!preview.file) return;
              const url = `/api/file/download?filePath=${encodeURIComponent(preview.file.path)}`;
              window.open(url, '_blank');
            }}
          >
            Download
          </Button>,
          <Button key="close" onClick={closePreview}>
            Close
          </Button>,
        ]}
        width="70%"
        style={{ top: 40 }}
      >
        {preview.loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : preview.error ? (
          <div style={{ color: 'red' }}>{preview.error}</div>
        ) : (
          <div style={{ width: '100%' }}>{renderPreview()}</div>
        )}
      </Modal>
    </Card>
  );
};

export default ThoughtsBox;
