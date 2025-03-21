export async function uploadFile(
  file: File,
  setUploading?: (uploading: boolean) => void,
): Promise<string> {
  try {
    setUploading?.(true);

    // Read file as array buffer and convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let base64Content = '';
    const chunkSize = 8192; // Process 8KB chunks

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      base64Content += String.fromCharCode.apply(null, Array.from(chunk));
    }

    base64Content = btoa(base64Content);

    // TODO: all /api/grpc calls should be routed through RTK
    const response = await fetch('/api/grpc/nonStreamingTemporaryFileUpload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_content: base64Content,
        file_name: file.name,
      }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.file_path;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  } finally {
    setUploading?.(false);
  }
}
