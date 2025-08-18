import React from 'react';
import { Card, Tag, Button, Tooltip } from 'antd';
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
} from '@ant-design/icons';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectWorkflowSessionDirectory } from '@/app/workflows/editorSlice';
import ArtifactPreviewModal from '@/app/components/workflowApp/ArtifactPreviewModal';

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
  const [_loading, setLoading] = React.useState<boolean>(false);
  const initialPathsRef = React.useRef<Set<string>>(new Set());
  const artifactsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [previewVisible, setPreviewVisible] = React.useState<boolean>(false);
  const [selectedFile, setSelectedFile] = React.useState<FileInfo | null>(null);

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

  

  const openPreview = (file: FileInfo) => {
    setSelectedFile(file);
    setPreviewVisible(true);
  };

  return (
    <Card
      size="small"
      bodyStyle={{ padding: 8 }}
      style={{
        backgroundColor: '#fff8e7',
        backgroundImage:
          'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,248,230,0.9) 50%, rgba(255,255,255,0.85) 100%)',
        border: '1px solid #efe7d9',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
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
          background: linear-gradient(90deg, #000 0%, #000 45%, #ffffff 50%, #000 55%, #000 100%);
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            color: '#000',
          }}
        >
          {isCollapsed ? (
            <RightOutlined style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }} />
          ) : (
            <DownOutlined style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }} />
          )}
          <div
            className={active ? 'thoughtsbox-shimmer-text' : undefined}
            style={{
              fontSize: 11,
              fontWeight: 600,
              opacity: 0.95,
              color: active ? 'transparent' : '#000',
            }}
          >
            Thoughts
          </div>
        </div>
        <span style={{ fontSize: 10, opacity: 0.8, color: '#000' }}>{entries.length}</span>
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
              <div style={{ fontSize: 10, opacity: 0.8, color: '#000' }}>No thoughts yet…</div>
            )}
            {entries.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 6 }}>
                <div
                  style={{ fontSize: 10, lineHeight: 1.4, whiteSpace: 'pre-wrap', color: '#000' }}
                >
                  {entry.thought}
                </div>
                {entry.tool && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 10, opacity: 0.9, marginRight: 4, color: '#000' }}>
                      Using Tool
                    </span>
                    <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', height: 18 }}>
                      {entry.tool}
                    </Tag>
                  </div>
                )}
                {entry.coworker && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 10, opacity: 0.9, marginRight: 4, color: '#000' }}>
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
          <div style={{ width: 1, background: '#e8e8e8' }} />
          {/* Right: artifacts 20% */}
          <div style={{ flexBasis: '20%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, opacity: 0.9, color: '#000' }}>Artifacts</div>
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
                      onClick={() => openPreview(f)}
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
                          color: '#000',
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

      <ArtifactPreviewModal
        visible={previewVisible}
        file={selectedFile}
        onClose={() => setPreviewVisible(false)}
      />
    </Card>
  );
};

export default ThoughtsBox;
