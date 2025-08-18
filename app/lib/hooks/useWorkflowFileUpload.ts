import { useState } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import {
  selectWorkflowSessionId,
  selectWorkflowSessionDirectory,
  updatedWorkflowSessionId,
  updatedWorkflowSessionDirectory,
} from '@/app/workflows/editorSlice';
import { useGetWorkflowDataQuery } from '@/app/workflows/workflowAppApi';
import { uploadFileToWorkflowSession } from '../workflowFileUpload';
import { useGlobalNotification } from '@/app/components/Notifications';
import { createSessionForWorkflow } from '@/app/lib/session';

export interface UseWorkflowFileUploadOptions {
  workflow?: any;
  renderMode: 'studio' | 'workflow';
}

export const useWorkflowFileUpload = (options: UseWorkflowFileUploadOptions) => {
  const { workflow, renderMode } = options;
  const [uploading, setUploading] = useState(false);
  const [_uploadingCount, setUploadingCount] = useState(0);
  const abortControllersRef = useState<Record<string, AbortController>>({})[0];
  const dispatch = useAppDispatch();
  const sessionId = useAppSelector(selectWorkflowSessionId);
  const sessionDirectory = useAppSelector(selectWorkflowSessionDirectory);
  const { data: workflowData } = useGetWorkflowDataQuery();
  const notificationApi = useGlobalNotification();

  const ensureSession = async (): Promise<{ session_id: string; session_directory: string }> => {
    if (sessionId && sessionDirectory) {
      return { session_id: sessionId, session_directory: sessionDirectory };
    }
    const data = await createSessionForWorkflow({ renderMode, workflow, workflowData });
    dispatch(updatedWorkflowSessionId(data.session_id));
    if (data.session_directory) {
      dispatch(updatedWorkflowSessionDirectory(data.session_directory));
    }
    return { session_id: data.session_id, session_directory: data.session_directory };
  };

  const uploadFile = async (file: File, _providedSessionId?: string): Promise<boolean> => {
    try {
      setUploadingCount((prev) => prev + 1);
      setUploading(true);

      // Ensure session exists and get directory
      const ensured = await ensureSession();

      // Upload file
      const controller = new AbortController();
      abortControllersRef[file.name] = controller;

      const success = await uploadFileToWorkflowSession({
        file,
        sessionDirectory: ensured.session_directory,
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
      try {
        delete abortControllersRef[file.name];
      } catch {}
      setUploadingCount((prev) => {
        const newCount = Math.max(0, prev - 1);
        if (newCount === 0) {
          setUploading(false);
        }
        return newCount;
      });
    }
  };

  const uploadMultipleFiles = async (files: File[]): Promise<boolean[]> => {
    // Ensure session is created before all uploads
    await ensureSession();
    // Upload files in parallel
    const promises = files.map((file) => uploadFile(file));
    return Promise.all(promises);
  };

  return {
    uploadFile,
    uploadMultipleFiles,
    uploading,
    sessionId,
    ensureSession,
    cancelUpload: (fileName: string) => {
      const controller = abortControllersRef[fileName];
      if (controller) {
        try {
          controller.abort();
        } catch {}
        delete abortControllersRef[fileName];
      }
    },
  };
};
