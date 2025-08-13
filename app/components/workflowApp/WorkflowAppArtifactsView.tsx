import React, { useState, useEffect } from 'react';
import { List, Empty, Spin, Alert, Button, Tooltip, Typography, Row, Col, Badge, Modal } from 'antd';
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
  BugOutlined
} from '@ant-design/icons';
import { Workflow } from '@/studio/proto/agent_studio';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { useAppSelector } from '@/app/lib/hooks/hooks';
import { selectWorkflowSessionDirectory } from '@/app/workflows/editorSlice';

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
  sessionId 
}) => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectUrlInfo, setProjectUrlInfo] = useState<ProjectUrlInfo | null>(null);
  
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
  }>({
    visible: false,
    file: null,
    content: null,
    blob: null,
    blobUrl: null,
    loading: false,
    error: null,
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
      const response = await fetch(`/api/file/listDirectory?directoryPath=${encodeURIComponent(sessionDir)}`);
      const data = await response.json();
      
      console.log('API Response:', data); // Debug logging
      console.log('Session directory:', sessionDir); // Debug logging
      
      if (response.ok && data.files) {
        console.log('Raw files from API:', data.files); // Debug logging
        
        // Filter out files with invalid names and sort by name for consistent display
        const validFiles = data.files.filter((file: FileInfo) => {
          const isValid = file && file.name && typeof file.name === 'string' && file.name.trim() !== '';
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
        
        const sortedFiles = validFiles.sort((a: FileInfo, b: FileInfo) => a.name.localeCompare(b.name));
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
    if (['py', 'js', 'ts', 'tsx', 'jsx', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(extension || '')) {
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
    if (['txt', 'md', 'readme'].includes(extension || '') || fileName.toLowerCase().includes('readme')) {
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
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Invalid date';
    }
  };

  // Handle file preview
  const handlePreview = async (file: FileInfo) => {
    console.log('Preview file:', file); // Debug logging
    console.log('File path being used:', file.path); // Debug logging
    
    setPreviewModal({
      visible: true,
      file,
      content: null,
      blob: null,
      blobUrl: null,
      loading: true,
      error: null,
    });

    // Guard: very large files should not be previewed – instruct user to download
    const MAX_PREVIEW_BYTES = 25 * 1024 * 1024; // 25MB
    if (typeof file.size === 'number' && file.size > MAX_PREVIEW_BYTES) {
      setPreviewModal(prev => ({
        ...prev,
        loading: false,
        error: 'This file is too large to preview in the browser. Please download it to view locally.',
      }));
      return;
    }

    try {
      // Download the file as a blob
      const downloadUrl = `/api/file/download?filePath=${encodeURIComponent(file.path)}`;
      console.log('Download URL:', downloadUrl); // Debug logging
      
      const response = await fetch(downloadUrl);
      console.log('Download response status:', response.status); // Debug logging
      console.log('Download response headers:', response.headers.get('content-type')); // Debug logging
      
      if (response.ok) {
        const blob = await response.blob();
        console.log('Download response blob size:', blob.size); // Debug logging
        console.log('Download response blob type:', blob.type); // Debug logging
        
        // Debug: Check if blob contains JSON (indicating it's a directory listing instead of file content)
        if (blob.size < 1024) { // Only check small blobs
          try {
            const tempText = await blob.text();
            console.log('Download response blob content (first 500 chars):', tempText.substring(0, 500)); // Debug logging
            if (tempText.includes('"files":[') || tempText.includes('"is_dir"')) {
              console.error('ERROR: Received directory listing instead of file content!');
              setPreviewModal(prev => ({
                ...prev,
                error: 'Received directory listing instead of file content. Check console for details.',
                loading: false,
              }));
              return;
            }
          } catch (err) {
            console.log('Could not read blob as text for debugging:', err);
          }
        }
        
        const blobUrl = window.URL.createObjectURL(blob);
        
        // For text files, also read the content as text
        let textContent = null;
        const isTextFile = isTextBasedFile(file.name);
        
        if (isTextFile && blob.size < 10 * 1024 * 1024) { // Only read text for files < 10MB
          try {
            textContent = await blob.text();
          } catch (err) {
            console.warn('Failed to read blob as text:', err);
          }
        }

        setPreviewModal(prev => ({
          ...prev,
          blob,
          blobUrl,
          content: textContent,
          loading: false,
        }));
      } else {
        const data = await response.json();
        console.log('Download API error response:', data); // Debug logging
        setPreviewModal(prev => ({
          ...prev,
          error: data.error || 'Failed to load file',
          loading: false,
        }));
      }
    } catch (err) {
      setPreviewModal(prev => ({
        ...prev,
        error: 'Failed to load file content',
        loading: false,
      }));
    }
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
    });
  };

  // Check if a file is text-based
  const isTextBasedFile = (fileName: string): boolean => {
    const textExtensions = [
      'txt', 'log', 'md', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 
      'css', 'html', 'xml', 'yaml', 'yml', 'ini', 'conf', 'config', 
      'csv', 'sql', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 
      'go', 'rs', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
      'dockerfile', 'gitignore', 'env', 'properties', 'toml'
    ];
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    return textExtensions.includes(extension || '') || 
           fileName.toLowerCase().includes('readme') ||
           fileName.toLowerCase().includes('license') ||
           fileName.toLowerCase().includes('changelog');
  };

  // Get file type category
  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) {
      return 'image';
    }
    if (['pdf'].includes(extension || '')) {
      return 'pdf';
    }
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension || '')) {
      return 'video';
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension || '')) {
      return 'audio';
    }
    if (isTextBasedFile(fileName)) {
      return 'text';
    }
    
    return 'binary';
  };

  // Render file content based on file type
  const renderFileContent = (file: FileInfo, content: string | null, blobUrl: string | null) => {
    if (!blobUrl) return null;

    const fileType = getFileType(file.name);

    switch (fileType) {
      case 'image':
        return (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <img 
              src={blobUrl} 
              alt={file.name}
              style={{ 
                maxWidth: '100%', 
                maxHeight: '60vh', 
                objectFit: 'contain',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                if (nextElement) {
                  nextElement.style.display = 'block';
                }
              }}
            />
            <div style={{ display: 'none', padding: '40px' }}>
              <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
              <Typography.Title level={4} type="secondary">Cannot Display Image</Typography.Title>
              <Typography.Text type="secondary">
                This image file cannot be displayed in the browser.
              </Typography.Text>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div style={{ width: '100%', height: '60vh' }}>
            <embed
              src={blobUrl}
              type="application/pdf"
              width="100%"
              height="100%"
              style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}
            />
          </div>
        );

      case 'video':
        return (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <video 
              controls 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '60vh',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
              }}
            >
              <source src={blobUrl} />
              Your browser does not support the video tag.
            </video>
          </div>
        );

      case 'audio':
        return (
          <div style={{ textAlign: 'center', width: '100%', padding: '40px' }}>
            <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
            <Typography.Title level={4} type="secondary">Audio File</Typography.Title>
            <audio 
              controls 
              style={{ width: '100%', maxWidth: '400px', marginTop: '16px' }}
            >
              <source src={blobUrl} />
              Your browser does not support the audio tag.
            </audio>
          </div>
        );

      case 'text':
        if (!content) {
          return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
              <Typography.Title level={4} type="secondary">Text File</Typography.Title>
              <Typography.Text type="secondary">
                File is too large to display as text or failed to load content.
                <br />
                Use the download button to save the file.
              </Typography.Text>
            </div>
          );
        }

        return (
          <div style={{ width: '100%' }}>
            <pre
              style={{
                backgroundColor: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                padding: '12px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                fontSize: '12px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, source-code-pro, monospace',
                lineHeight: '1.4',
                maxHeight: '60vh',
                overflow: 'auto',
              }}
            >
              {content}
            </pre>
          </div>
        );

      default: // binary
        return (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
            <Typography.Title level={4} type="secondary">Binary File</Typography.Title>
            <Typography.Text type="secondary">
              This file contains binary data and cannot be previewed.
              <br />
              Use the download button to save the file.
            </Typography.Text>
          </div>
        );
    }
  };

  const cmlFilesUrl = getCMLFilesUrl();

  // Check if we have workflow data in either studio mode (workflow prop) or workflow mode (workflowData)
  const hasWorkflowData = Boolean(workflow || workflowData?.renderMode === 'workflow');

  if (!hasWorkflowData) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Empty 
          description="No workflow selected" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  if (!sessionId || !sessionDirectory) {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <FolderOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
        <Typography.Title level={4} type="secondary">No Session Started</Typography.Title>
        <Typography.Text type="secondary">
          Run the workflow to generate a session and view artifacts
        </Typography.Text>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
      {/* Header with path link and refresh */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <Text style={{ fontSize: '14px' }}>
              Project Files Path For session {sessionId}
            </Text>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
        <Alert 
          message="Error" 
          description={error} 
          type="error" 
          style={{ marginBottom: '16px' }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>
            <Text type="secondary">Loading artifacts...</Text>
          </div>
        </div>
      ) : files.length === 0 ? (
        <Empty 
          description="No artifacts found in this session"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Row gutter={[6, 6]}>
          {files.map((file, index) => (
            <Col 
              key={`${file.name}-${index}`} 
              xs={24} 
              sm={12} 
              md={8} 
              lg={6}
              xl={6}
            >
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ flexShrink: 0 }}>
                    {getFileIcon(file.name)}
                  </div>
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
                          whiteSpace: 'nowrap'
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1px', marginTop: 'auto' }}>
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
                        height: '16px'
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
                        height: '16px'
                      }}
                    />
                  </Tooltip>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* Preview Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {previewModal.file && getFileIcon(previewModal.file.name)}
            <span>{previewModal.file?.name || 'File Preview'}</span>
            {previewModal.file && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                ({formatFileSize(previewModal.file.size)})
              </Text>
            )}
          </div>
        }
        open={previewModal.visible}
        onCancel={closePreviewModal}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => previewModal.file && handleDownload(previewModal.file)}>
            Download
          </Button>,
          <Button key="close" onClick={closePreviewModal}>
            Close
          </Button>,
        ]}
        width="80%"
        style={{ top: 20 }}
        styles={{ 
          body: {
            maxHeight: '70vh', 
            overflow: 'auto',
            padding: '16px',
          }
        }}
      >
        {previewModal.loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>
              <Text type="secondary">Loading file content...</Text>
            </div>
          </div>
        ) : previewModal.error ? (
          <Alert 
            message="Error" 
            description={previewModal.error} 
            type="error" 
            showIcon
          />
        ) : (
          <div style={{ width: '100%' }}>
            {previewModal.file && renderFileContent(previewModal.file, previewModal.content, previewModal.blobUrl)}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WorkflowAppArtifactsView;