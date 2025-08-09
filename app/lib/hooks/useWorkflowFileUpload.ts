import { useState } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { 
  selectWorkflowSessionId, 
  updatedWorkflowSessionId 
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { 
  generateSessionId, 
  getWorkflowDirectory, 
  uploadFileToWorkflowSession 
} from '../workflowFileUpload';
import { useGlobalNotification } from '@/app/components/Notifications';

export interface UseWorkflowFileUploadOptions {
  workflow?: any;
  renderMode: 'studio' | 'workflow';
}

export const useWorkflowFileUpload = (options: UseWorkflowFileUploadOptions) => {
  const { workflow, renderMode } = options;
  const [uploading, setUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const abortControllersRef = useState<Record<string, AbortController>>({})[0];
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const { data: workflowData } = useGetWorkflowDataQuery();
  const notificationApi = useGlobalNotification();

  const ensureSessionId = (): string => {
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      dispatch(updatedWorkflowSessionId(currentSessionId));
    }
    return currentSessionId;
  };

  const uploadFile = async (file: File, providedSessionId?: string): Promise<boolean> => {
    try {
      setUploadingCount(prev => prev + 1);
      setUploading(true);

      // Use provided session ID or ensure one exists
      const currentSessionId = providedSessionId || ensureSessionId();

      // Get workflow directory
      const workflowDirectory = getWorkflowDirectory(renderMode, workflow, workflowData);
      
      if (!workflowDirectory) {
        notificationApi.error({
          message: 'Upload Failed',
          description: 'Unable to determine workflow directory',
          placement: 'topRight',
        });
        return false;
      }

      // Upload file
      const controller = new AbortController();
      abortControllersRef[file.name] = controller;

      const success = await uploadFileToWorkflowSession({
        file,
        sessionId: currentSessionId,
        workflowDirectory,
        renderMode,
        workflowData,
        signal: controller.signal,
      });

      if (success) {
        notificationApi.success({
          message: 'File Uploaded',
          description: `${file.name} has been uploaded successfully`,
          placement: 'topRight',
        });
        
        return true;
      } else {
        notificationApi.error({
          message: 'Upload Failed',
          description: `Failed to upload ${file.name}`,
          placement: 'topRight',
        });
        return false;
      }
    } catch (error) {
      console.error('Upload error:', error);
      notificationApi.error({
        message: 'Upload Error',
        description: 'An unexpected error occurred during upload',
        placement: 'topRight',
      });
      return false;
    } finally {
      // Cleanup controller for this file
      try { delete abortControllersRef[file.name]; } catch {}
      setUploadingCount(prev => {
        const newCount = Math.max(0, prev - 1);
        if (newCount === 0) {
          setUploading(false);
        }
        return newCount;
      });
    }
  };

  const uploadMultipleFiles = async (files: File[]): Promise<boolean[]> => {
    // Ensure session ID is generated once before all uploads
    const sharedSessionId = ensureSessionId();
    
    // Upload files in parallel with shared session ID
    const promises = files.map(file => uploadFile(file, sharedSessionId));
    return Promise.all(promises);
  };

  return {
    uploadFile,
    uploadMultipleFiles,
    uploading,
    sessionId,
    ensureSessionId,
    cancelUpload: (fileName: string) => {
      const controller = abortControllersRef[fileName];
      if (controller) {
        try { controller.abort(); } catch {}
        delete abortControllersRef[fileName];
      }
    },
  };
};