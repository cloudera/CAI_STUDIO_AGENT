import React from 'react';
import { Modal, Button, Spin, Typography, Alert, Table } from 'antd';
import {
  FileOutlined,
  DownloadOutlined,
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
  BugOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const { Text } = Typography;

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: string | null;
}

interface ArtifactPreviewModalProps {
  visible: boolean;
  file: FileInfo | null;
  onClose: () => void;
}

const MAX_PREVIEW_BYTES = 25 * 1024 * 1024; // 25MB

const ArtifactPreviewModal: React.FC<ArtifactPreviewModalProps> = ({ visible, file, onClose }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [content, setContent] = React.useState<string | null>(null);
  const [tooLarge, setTooLarge] = React.useState<boolean>(false);
  const [tableRows, setTableRows] = React.useState<any[]>([]);
  const [tableColumns, setTableColumns] = React.useState<any[]>([]);

  React.useEffect(() => {
    let isActive = true;
    const run = async () => {
      if (!visible || !file) return;
      setLoading(true);
      setError(null);
      setContent(null);
      setBlobUrl(null);
      setTooLarge(false);
      setTableRows([]);
      setTableColumns([]);

      if (typeof file.size === 'number' && file.size > MAX_PREVIEW_BYTES) {
        if (!isActive) return;
        setLoading(false);
        setTooLarge(true);
        return;
      }

      try {
        const downloadUrl = `/api/file/download?filePath=${encodeURIComponent(file.path)}`;
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load file');
        }
        const blob = await response.blob();

        // Detect accidental directory JSON
        if (blob.size < 1024) {
          try {
            const text = await blob.text();
            if (text.includes('"files":[') || text.includes('"is_dir"')) {
              throw new Error('Received directory listing instead of file content');
            }
          } catch {
            // ignore
          }
        }

        const url = window.URL.createObjectURL(blob);
        if (!isActive) return;
        setBlobUrl(url);

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (isTextBasedFile(file.name) && blob.size < 10 * 1024 * 1024) {
          try {
            const textContent = await blob.text();
            if (!isActive) return;
            setContent(textContent);
            // Parse CSV files into a table view
            if (ext === 'csv') {
              try {
                const parsed = Papa.parse(textContent, {
                  header: true,
                  dynamicTyping: true,
                  skipEmptyLines: true,
                });
                const data: any[] = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
                const fields: string[] =
                  parsed.meta && Array.isArray((parsed as any).meta?.fields)
                    ? (parsed as any).meta.fields
                    : [];
                const keys = fields.length > 0 ? fields : data[0] ? Object.keys(data[0]) : [];
                const columns = keys.map((k: string) => ({
                  title: k,
                  dataIndex: k,
                  key: k,
                  ellipsis: true,
                }));
                const rows = data.map((row: any, idx: number) => ({ key: String(idx), ...row }));
                if (!isActive) return;
                setTableColumns(columns);
                setTableRows(rows);
              } catch (csvErr: any) {
                if (!isActive) return;
                setError(csvErr?.message || 'Failed to parse CSV file');
              }
            }
          } catch {
            // ignore
          }
        }

        // Parse Excel files into a table view
        if ((ext === 'xlsx' || ext === 'xls') && blob.size < 25 * 1024 * 1024) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            const keys =
              json.length > 0
                ? Array.from(
                    json.reduce((set: Set<string>, row: any) => {
                      Object.keys(row).forEach((k) => set.add(k));
                      return set;
                    }, new Set<string>()),
                  )
                : [];
            const columns = keys.map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true }));
            const rows = json.map((row, idx) => ({ key: String(idx), ...row }));
            if (!isActive) return;
            setTableColumns(columns);
            setTableRows(rows);
          } catch (excelErr: any) {
            if (!isActive) return;
            setError(excelErr?.message || 'Failed to parse Excel file');
          }
        }

        // Fallback: Parse large CSV files up to MAX_PREVIEW_BYTES
        if (ext === 'csv' && tableRows.length === 0 && blob.size < MAX_PREVIEW_BYTES) {
          try {
            const textContent = await blob.text();
            if (!isActive) return;
            const parsed = Papa.parse(textContent, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
            });
            const data: any[] = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
            const fields: string[] =
              parsed.meta && Array.isArray((parsed as any).meta?.fields)
                ? (parsed as any).meta.fields
                : [];
            const keys = fields.length > 0 ? fields : data[0] ? Object.keys(data[0]) : [];
            const columns = keys.map((k: string) => ({
              title: k,
              dataIndex: k,
              key: k,
              ellipsis: true,
            }));
            const rows = data.map((row: any, idx: number) => ({ key: String(idx), ...row }));
            setTableColumns(columns);
            setTableRows(rows);
          } catch (csvErr: any) {
            if (!isActive) return;
            setError(csvErr?.message || 'Failed to parse CSV file');
          }
        }
      } catch (e: any) {
        if (!isActive) return;
        setError(e?.message || 'Failed to load file content');
      } finally {
        if (!isActive) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      isActive = false;
    };
  }, [visible, file]);

  React.useEffect(() => {
    return () => {
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const handleDownload = React.useCallback(() => {
    if (!file) return;
    const downloadUrl = `/api/file/download?filePath=${encodeURIComponent(file.path)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name || '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [file]);

  const getFileIcon = (fileName?: string | null) => {
    if (!fileName) return <FileOutlined style={{ color: '#666', fontSize: 30 }} />;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 30 }} />;
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext || ''))
      return <FileImageOutlined style={{ color: '#52c41a', fontSize: 30 }} />;
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext || ''))
      return <VideoCameraOutlined style={{ color: '#722ed1', fontSize: 30 }} />;
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext || ''))
      return <AudioOutlined style={{ color: '#fa8c16', fontSize: 30 }} />;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext || ''))
      return <FileZipOutlined style={{ color: '#faad14', fontSize: 30 }} />;
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
      return <CodeOutlined style={{ color: '#722ed1', fontSize: 30 }} />;
    if (['html', 'css', 'scss', 'sass', 'less'].includes(ext || ''))
      return <CodeOutlined style={{ color: '#1890ff', fontSize: 30 }} />;
    if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(ext || ''))
      return <DatabaseOutlined style={{ color: '#1890ff', fontSize: 30 }} />;
    if (['csv', 'xlsx', 'xls'].includes(ext || ''))
      return <FileExcelOutlined style={{ color: '#52c41a', fontSize: 30 }} />;
    if (['doc', 'docx', 'rtf'].includes(ext || ''))
      return <FileWordOutlined style={{ color: '#1890ff', fontSize: 30 }} />;
    if (['log', 'logs'].includes(ext || ''))
      return <BugOutlined style={{ color: '#fa8c16', fontSize: 30 }} />;
    if (['txt', 'md', 'readme'].includes(ext || '') || fileName.toLowerCase().includes('readme'))
      return <FileTextOutlined style={{ color: '#52c41a', fontSize: 30 }} />;
    return <FileOutlined style={{ color: '#666', fontSize: 30 }} />;
  };

  const isTextBasedFile = (fileName: string): boolean => {
    const textExtensions = [
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
      'bash',
      'zsh',
      'fish',
      'ps1',
      'bat',
      'cmd',
      'dockerfile',
      'gitignore',
      'env',
      'properties',
      'toml',
    ];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return (
      textExtensions.includes(extension || '') ||
      fileName.toLowerCase().includes('readme') ||
      fileName.toLowerCase().includes('license') ||
      fileName.toLowerCase().includes('changelog')
    );
  };

  const getMonacoLanguage = (fileName: string): string | null => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cpp':
        return 'cpp';
      case 'c':
        return 'c';
      case 'cs':
        return 'csharp';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      case 'css':
      case 'scss':
      case 'less':
        return 'css';
      case 'html':
        return null;
      case 'xml':
        return 'xml';
      case 'sql':
        return 'sql';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'sh':
      case 'bash':
      case 'zsh':
        return 'shell';
      case 'md':
        return 'markdown';
      default:
        return null;
    }
  };

  const getFileType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (['csv', 'xlsx', 'xls'].includes(extension || '')) return 'table';
    if (['html'].includes(extension || '')) return 'html';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || ''))
      return 'image';
    if (['pdf'].includes(extension || '')) return 'pdf';
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension || '')) return 'audio';
    if (isTextBasedFile(fileName)) return 'text';
    return 'binary';
  };

  const renderFileContent = () => {
    if (!file || !blobUrl) return null;
    const fileType = getFileType(file.name);

    switch (fileType) {
      case 'table':
        return (
          <div style={{ width: '100%' }}>
            <Table
              dataSource={tableRows}
              columns={tableColumns}
              size="small"
              pagination={{ pageSize: 50, showSizeChanger: true }}
              scroll={{ x: 'max-content', y: '55vh' }}
            />
          </div>
        );
      case 'image':
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '60vh',
            }}
          >
            <img
              src={blobUrl}
              alt={file.name}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        );

      case 'html':
        return (
          <div style={{ width: '100%', height: '60vh' }}>
            <iframe
              src={blobUrl}
              title={file.name}
              width="100%"
              height="100%"
              style={{ border: '1px solid #d9d9d9', borderRadius: '4px' }}
            />
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
            <Typography.Title level={4} type="secondary">
              Audio File
            </Typography.Title>
            <audio controls style={{ width: '100%', maxWidth: '400px', marginTop: '16px' }}>
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
              <Typography.Title level={4} type="secondary">
                Preview Unavailable
              </Typography.Title>
              <Typography.Text type="secondary">
                We can't display this file nicely in the browser. Please use the download button to
                view it locally.
              </Typography.Text>
            </div>
          );
        }

        {
          const language = getMonacoLanguage(file.name);
          if (language) {
            return (
              <div style={{ width: '100%', height: '60vh' }}>
                <Editor
                  language={language}
                  value={content}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                  }}
                  height="60vh"
                />
              </div>
            );
          }
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

      default:
        return (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
            <Typography.Title level={4} type="secondary">
              Binary File
            </Typography.Title>
            <Typography.Text type="secondary">
              This file contains binary data and cannot be previewed.
              <br />
              Use the download button to save the file.
            </Typography.Text>
          </div>
        );
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {file && getFileIcon(file.name)}
          <span>{file?.name || 'File Preview'}</span>
          {file && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({typeof file.size === 'number' ? `${(file.size / 1024).toFixed(1)} KB` : 'Unknown'})
            </Text>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="download" icon={<DownloadOutlined />} onClick={handleDownload}>
          Download
        </Button>,
        <Button key="close" onClick={onClose}>
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
        },
      }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading file content...</Text>
          </div>
        </div>
      ) : tooLarge ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <FileOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <Typography.Title level={4} type="secondary">
            This file is quite large
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '8px 0 16px' }}>
            We can't display large files beautifully in the browser. Use the Download button below
            to view it locally for the best experience.
          </Typography.Paragraph>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
            Download File
          </Button>
        </div>
      ) : error ? (
        <Alert message="Error" description={error} type="error" showIcon />
      ) : (
        <div style={{ width: '100%' }}>{renderFileContent()}</div>
      )}
    </Modal>
  );
};

export default ArtifactPreviewModal;
