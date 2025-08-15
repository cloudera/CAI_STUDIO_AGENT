export interface WorkflowUploadFileOptions {
  file: File;
  sessionDirectory: string;
  renderMode: 'studio' | 'workflow';
  workflowData?: any;
  signal?: AbortSignal;
}

export const getWorkflowDirectory = (
  renderMode: 'studio' | 'workflow',
  workflow: any,
  workflowData: any,
): string | null => {
  if (renderMode === 'workflow') {
    return workflowData?.deployedWorkflow?.workflow_directory || null;
  } else {
    return workflow?.directory || null;
  }
};

export const uploadFileToWorkflowSession = async (
  options: WorkflowUploadFileOptions,
): Promise<boolean> => {
  const { file, sessionDirectory, signal } = options;

  try {
    // Construct target path
    const targetPath = `${sessionDirectory}/${file.name}`;

    // console.log(`🔍 DEBUG: Uploading file to: ${targetPath}`);

    // First, try to delete existing file (ignore failures)
    try {
      const deleteResponse = await fetch('/api/file/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath: targetPath }),
      });

      if (deleteResponse.ok) {
        // console.log(`🗑️  Deleted existing file: ${targetPath}`);
      }
    } catch {
      // console.log(`ℹ️  No existing file to delete or deletion failed (continuing anyway): ${targetPath}`);
    }

    // Upload the file using multipart form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetPath', targetPath);

    const uploadResponse = await fetch('/api/file/upload', {
      method: 'POST',
      body: formData,
      signal,
    });

    if (uploadResponse.ok) {
      // console.log(`✅ Successfully uploaded file to ${targetPath}`);
      return true;
    } else {
      const errorData = await uploadResponse.json();
      console.error(`❌ Upload failed:`, errorData);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error uploading file:`, error);
    return false;
  }
};
