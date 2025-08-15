import React, { useRef } from 'react';
import { Button, Upload, Tooltip } from 'antd';
import { UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { UploadProps } from 'antd/es/upload';
import { useWorkflowFileUpload } from '@/app/lib/hooks/useWorkflowFileUpload';

interface FileUploadButtonProps {
  workflow?: any;
  renderMode: 'studio' | 'workflow';
  buttonType?: 'default' | 'chat' | 'menu' | 'icon';
  disabled?: boolean;
  style?: React.CSSProperties;
  size?: 'small' | 'middle' | 'large';
  onUploadSuccess?: () => void;
  onFilesAdded?: (files: File[]) => void;
  onFileUploaded?: (file: File, success: boolean) => void;
}

const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  workflow,
  renderMode,
  buttonType = 'default',
  disabled = false,
  style,
  size = 'middle',
  onUploadSuccess,
  onFilesAdded,
  onFileUploaded,
}) => {
  const { uploadFile, uploadMultipleFiles, uploading, cancelUpload } = useWorkflowFileUpload({
    workflow,
    renderMode,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);

      if (onFilesAdded) {
        onFilesAdded(fileArray);
      }
      // Trigger callback immediately when files are selected
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Use uploadMultipleFiles for better session ID handling
      const results = await uploadMultipleFiles(fileArray);

      // Notify about each file result
      if (onFileUploaded) {
        fileArray.forEach((file, index) => {
          onFileUploaded(file, results[index]);
        });
      }
    }
    // Reset input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Expose a global cancel function usable by chips without tight coupling
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.__cancelUpload = (fileName: string) => cancelUpload(fileName);
  }

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      style={{ display: 'none' }}
      onChange={handleFileChange}
      disabled={disabled || uploading}
    />
  );

  // Chat button (+ icon)
  if (buttonType === 'chat') {
    return (
      <>
        {fileInput}
        <Tooltip title={uploading ? 'Uploading files...' : 'Upload files'}>
          <Button
            icon={<PlusOutlined />}
            onClick={handleButtonClick}
            disabled={disabled || uploading}
            loading={uploading}
            style={{
              backgroundColor: uploading ? '#1890ff' : undefined,
              borderColor: uploading ? '#1890ff' : undefined,
              color: uploading ? '#fff' : undefined,
              ...style,
            }}
            size={size}
          />
        </Tooltip>
      </>
    );
  }

  // Icon-only circular button (Upload icon)
  if (buttonType === 'icon') {
    return (
      <>
        {fileInput}
        <Tooltip title={uploading ? 'Uploading files...' : 'Upload files'}>
          <Button
            icon={<PlusOutlined />}
            onClick={handleButtonClick}
            disabled={disabled || uploading}
            loading={uploading}
            style={{
              backgroundColor: uploading ? '#1890ff' : undefined,
              borderColor: uploading ? '#1890ff' : undefined,
              color: uploading ? '#fff' : undefined,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...style,
            }}
            size={size}
          />
        </Tooltip>
      </>
    );
  }

  // Menu item (text only)
  if (buttonType === 'menu') {
    return (
      <>
        {fileInput}
        <div
          onClick={handleButtonClick}
          style={{
            padding: '5px 12px',
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            opacity: disabled || uploading ? 0.5 : 1,
            ...style,
          }}
        >
          <UploadOutlined style={{ marginRight: 8 }} />
          Upload Files
        </div>
      </>
    );
  }

  // Default button
  return (
    <>
      {fileInput}
      <Tooltip title={uploading ? 'Uploading files...' : 'Upload files to session directory'}>
        <Button
          icon={<UploadOutlined />}
          onClick={handleButtonClick}
          disabled={disabled || uploading}
          loading={uploading}
          type={uploading ? 'primary' : 'default'}
          style={{
            backgroundColor: uploading ? '#1890ff' : undefined,
            borderColor: uploading ? '#1890ff' : undefined,
            color: uploading ? '#fff' : undefined,
            ...style,
          }}
          size={size}
        >
          {uploading ? 'Uploading...' : 'Upload Files'}
        </Button>
      </Tooltip>
    </>
  );
};

export default FileUploadButton;
