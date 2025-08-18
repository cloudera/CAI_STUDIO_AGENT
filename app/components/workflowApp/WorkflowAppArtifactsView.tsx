import React, { useState, useEffect } from 'react';
import {
  List,
  Empty,
  Spin,
  Alert,
  Button,
  Tooltip,
  Typography,
  Row,
  Col,
  Badge,
  Input,
} from 'antd';
import {
  FileOutlined,
  DownloadOutlined,
  EyeOutlined,
  FolderOutlined,
  ReloadOutlined,
  ExportOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileTextOutlined,
  CodeOutlined,
  FileSearchOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  DatabaseOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { Workflow } from '@/studio/proto/agent_studio';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectWorkflowSessionDirectory } from '@/app/workflows/editorSlice';
import ArtifactPreviewModal from '@/app/components/workflowApp/ArtifactPreviewModal';

const { Text } = Typography;

export interface WorkflowAppArtifactsViewProps {
  workflow?: Workflow;
  sessionId?: string | null;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: string | null;
}

interface ProjectUrlInfo {
  scheme: string;
  domain: string;
  projectOwner: string;
  projectName: string;
  projectId: string;
  filesUrlBase: string;
}

const WorkflowAppArtifactsView: React.FC<WorkflowAppArtifactsViewProps> = ({
  workflow,
  sessionId,
}) => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectUrlInfo, setProjectUrlInfo] = useState<ProjectUrlInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Get workflow data to check render mode and get workflow directory
  const { data: workflowData } = useGetWorkflowDataQuery();
  const [previewModal, setPreviewModal] = useState<{
    visible: boolean;
    file: FileInfo | null;
    content: string | null;
    blob: Blob | null;
    blobUrl: string | null;
    loading: boolean;
    error: string | null;
    tooLarge: boolean;
  }>({
    visible: false,
    file: null,
    content: null,
    blob: null,
    blobUrl: null,
    loading: false,
    error: null,
    tooLarge: false,
  });

  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);

  // Fetch project URL info
  const fetchProjectUrlInfo = async () => {
    try {
      const response = await fetch('/api/projectUrl');
      if (response.ok) {
        const urlInfo = await response.json();
        setProjectUrlInfo(urlInfo);
      }
    } catch (err) {
      console.error('Error fetching project URL info:', err);
    }
  };

  // Get CML Files URL
  const getCMLFilesUrl = () => {
    const sessionDir = sessionDirectory || null;
    if (!sessionDir || !projectUrlInfo) return null;

    // Construct the CML files URL using the project info
    return `${projectUrlInfo.filesUrlBase}/${sessionDir}`;
  };

  // Fetch files from session directory
  const fetchFiles = async (showLoading = true) => {
    const sessionDir = sessionDirectory || null;
    if (!sessionDir) return;

    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      // List all files in the session directory
      const response = await fetch(
        `/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDir)}`,
      );
      const data = await response.json();

      console.log('API Response:', data); // Debug logging
      console.log('Session directory:', sessionDir); // Debug logging

      if (response.ok && data.files) {
        console.log('Raw files from API:', data.files); // Debug logging

        // Filter out files with invalid names and sort by name for consistent display
        const validFiles = data.files.filter((file: FileInfo) => {
          const isValid =
            file && file.name && typeof file.name === 'string' && file.name.trim() !== '';
          if (!isValid) {
            console.log('Filtered out invalid file:', file); // Debug logging
          }
          return isValid;
        });

        console.log('Valid files after filtering:', validFiles); // Debug logging

        if (data.files.length > 0 && validFiles.length === 0) {
          console.log('All files were filtered out due to invalid names');
          setError('Files found but all have invalid names. Check console for details.');
        }

        const sortedFiles = validFiles.sort((a: FileInfo, b: FileInfo) =>
          a.name.localeCompare(b.name),
        );
        setFiles(sortedFiles);
      } else {
        console.log('No files found or API error:', data); // Debug logging
        setFiles([]);
        if (data.error) {
          setError(data.error);
        } else if (response.ok) {
          console.log('Directory exists but contains no files');
        }
      }
    } catch (err) {
      setError('Failed to fetch artifacts');
      console.error('Error fetching files:', err);
      setFiles([]);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Fetch project URL info on component mount
  useEffect(() => {
    fetchProjectUrlInfo();
  }, []);

  // Fetch files when component mounts or dependencies change
  useEffect(() => {
    if (sessionDirectory) {
      fetchFiles();
    } else {
      setFiles([]);
    }
  }, [sessionDirectory]);

  // Auto-refresh files every 5 seconds
  useEffect(() => {
    if (!sessionDirectory) return;

    const interval = setInterval(() => {
      fetchFiles(false); // Auto-refresh without showing loading spinner
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [sessionDirectory]);

  // Get file icon based on file type
  const getFileIcon = (fileName: string | undefined | null) => {
    if (!fileName || typeof fileName !== 'string') {
      return <FileOutlined style={{ color: '#666', fontSize: '30px' }} />;
    }

    const extension = fileName.split('.').pop()?.toLowerCase();

    // PDF files
    if (extension === 'pdf') {
      return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: '30px' }} />;
    }

    // Image files
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension || '')) {
      return <FileImageOutlined style={{ color: '#52c41a', fontSize: '30px' }} />;
    }

    // Video files
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(extension || '')) {
      return <VideoCameraOutlined style={{ color: '#722ed1', fontSize: '30px' }} />;
    }

    // Audio files
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(extension || '')) {
      return <AudioOutlined style={{ color: '#fa8c16', fontSize: '30px' }} />;
    }

    // Archive files
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension || '')) {
      return <FileZipOutlined style={{ color: '#faad14', fontSize: '30px' }} />;
    }

    // Code files
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
      ].includes(extension || '')
    ) {
      return <CodeOutlined style={{ color: '#722ed1', fontSize: '30px' }} />;
    }

    // Web files
    if (['html', 'css', 'scss', 'sass', 'less'].includes(extension || '')) {
      return <CodeOutlined style={{ color: '#1890ff', fontSize: '30px' }} />;
    }

    // Data/Config files
    if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(extension || '')) {
      return <DatabaseOutlined style={{ color: '#1890ff', fontSize: '30px' }} />;
    }

    // Spreadsheet files
    if (['csv', 'xlsx', 'xls'].includes(extension || '')) {
      return <FileExcelOutlined style={{ color: '#52c41a', fontSize: '30px' }} />;
    }

    // Document files
    if (['doc', 'docx', 'rtf'].includes(extension || '')) {
      return <FileWordOutlined style={{ color: '#1890ff', fontSize: '30px' }} />;
    }

    // Log files
    if (['log', 'logs'].includes(extension || '')) {
      return <BugOutlined style={{ color: '#fa8c16', fontSize: '30px' }} />;
    }

    // Text files
    if (
      ['txt', 'md', 'readme'].includes(extension || '') ||
      fileName.toLowerCase().includes('readme')
    ) {
      return <FileTextOutlined style={{ color: '#52c41a', fontSize: '30px' }} />;
    }

    // Default
    return <FileOutlined style={{ color: '#666', fontSize: '30px' }} />;
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      return (
        date.toLocaleDateString() +
        ' ' +
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return 'Invalid date';
    }
  };

  // Handle file preview (shared modal handles fetching/rendering)
  const handlePreview = (file: FileInfo) => {
    setPreviewModal({
      visible: true,
      file,
      content: null,
      blob: null,
      blobUrl: null,
      loading: false,
      error: null,
      tooLarge: false,
    });
  };

  // Handle file download
  const handleDownload = async (file: FileInfo) => {
    try {
      // Stream download directly via browser without buffering in memory
      const downloadUrl = `/api/file/download?filePath=${encodeURIComponent(file.path)}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.name || '';
      // Open in a new tab to avoid navigating away from the app when streaming large files
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to initiate download');
      console.error('Error initiating download:', err);
    }
  };

  // Close preview modal
  const closePreviewModal = () => {
    // Clean up blob URL to prevent memory leaks
    if (previewModal.blobUrl) {
      window.URL.revokeObjectURL(previewModal.blobUrl);
    }

    setPreviewModal({
      visible: false,
      file: null,
      content: null,
      blob: null,
      blobUrl: null,
      loading: false,
      error: null,
      tooLarge: false,
    });
  };

  // (Preview rendering moved to shared ArtifactPreviewModal)

  const cmlFilesUrl = getCMLFilesUrl();

  const visibleFiles = React.useMemo(() => {
    const query = (searchQuery || '').trim().toLowerCase();
    if (!query) return files;
    return files.filter((f) => (f.name || '').toLowerCase().includes(query));
  }, [files, searchQuery]);

  // Check if we have workflow data in either studio mode (workflow prop) or workflow mode (workflowData)
  const hasWorkflowData = Boolean(workflow || workflowData?.renderMode === 'workflow');

  if (!hasWorkflowData) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Empty description="No workflow selected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (!sessionId || !sessionDirectory) {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <FolderOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
        <Typography.Title level={4} type="secondary">
          No Session Started
        </Typography.Title>
        <Typography.Text type="secondary">
          Run the workflow to generate a session and view artifacts
        </Typography.Text>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      {/* Header with path link and refresh */}
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {cmlFilesUrl ? (
            <Text
              style={{
                fontSize: '14px',
                color: '#1890ff',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              onClick={() => window.open(cmlFilesUrl, '_blank')}
            >
              Project Files Path For session {sessionId}
            </Text>
          ) : (
            <Text style={{ fontSize: '14px' }}>Project Files Path For session {sessionId}</Text>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Input
            allowClear
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            placeholder="Search artifacts"
            style={{ width: 220 }}
          />
          <Badge dot color="green">
            <Tooltip title="Auto-refreshing every 5 seconds">
              <ClockCircleOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
            </Tooltip>
          </Badge>
          <Tooltip title="Manual refresh">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => fetchFiles(true)}
              loading={loading}
              size="small"
            />
          </Tooltip>
        </div>
      </div>

      {error && (
        <Alert message="Error" description={error} type="error" style={{ marginBottom: '16px' }} />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>
            <Text type="secondary">Loading artifacts...</Text>
          </div>
        </div>
      ) : visibleFiles.length === 0 ? (
        searchQuery.trim().length > 0 ? (
          <Empty description="No matching artifacts" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Empty
            description="No artifacts found in this session"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )
      ) : (
        <Row gutter={[6, 6]}>
          {visibleFiles.map((file, index) => (
            <Col key={`${file.name}-${index}`} xs={24} sm={12} md={8} lg={6} xl={6}>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: '4px',
                  padding: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  backgroundColor: '#fafafa',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '60px',
                  position: 'relative',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }}
                className="artifact-card"
                onClick={() => handlePreview(file)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#1890ff';
                  e.currentTarget.style.backgroundColor = '#f6ffed';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(24, 144, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#f0f0f0';
                  e.currentTarget.style.backgroundColor = '#fafafa';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <div style={{ flexShrink: 0 }}>{getFileIcon(file.name)}</div>
                  <div style={{ flex: 1, minWidth: 0, marginTop: '2px' }}>
                    <Tooltip title={file.name || 'Unknown file'} placement="top">
                      <Text
                        strong
                        style={{
                          fontSize: '11px',
                          display: 'block',
                          lineHeight: '1.2',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {file.name || 'Unknown file'}
                      </Text>
                    </Tooltip>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                      <Text type="secondary" style={{ fontSize: '9px' }}>
                        {formatFileSize(file.size)}
                      </Text>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1px',
                    marginTop: 'auto',
                  }}
                >
                  <Tooltip title="Preview file">
                    <Button
                      type="text"
                      icon={<EyeOutlined style={{ fontSize: '12px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(file);
                      }}
                      size="small"
                      style={{
                        color: '#1890ff',
                        padding: '2px 4px',
                        minWidth: 'auto',
                        height: '16px',
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="Download file">
                    <Button
                      type="text"
                      icon={<DownloadOutlined style={{ fontSize: '12px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      size="small"
                      style={{
                        color: '#52c41a',
                        padding: '2px 4px',
                        minWidth: 'auto',
                        height: '16px',
                      }}
                    />
                  </Tooltip>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      <ArtifactPreviewModal
        visible={previewModal.visible}
        file={previewModal.file}
        onClose={closePreviewModal}
      />
    </div>
  );
};

export default WorkflowAppArtifactsView;
