import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { writeFile } from 'fs/promises';

// Safely extract a human-readable message from an unknown error
const getErrorMessage = (maybeError: unknown): string => {
  if (maybeError instanceof Error) {
    return maybeError.message;
  }
  if (typeof maybeError === 'string') {
    return maybeError;
  }
  try {
    return JSON.stringify(maybeError);
  } catch {
    return String(maybeError);
  }
};

const createAgent = () => {
  const isTlsEnabled = process.env.AGENT_STUDIO_WORKBENCH_TLS_ENABLED === 'true';

  if (isTlsEnabled) {
    return new https.Agent({
      ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
    });
  } else {
    return new http.Agent();
  }
};

const getUrlScheme = () => {
  return process.env.AGENT_STUDIO_WORKBENCH_TLS_ENABLED === 'true' ? 'https' : 'http';
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const targetPath = formData.get('targetPath') as string;

    if (!file || !targetPath) {
      return NextResponse.json({ error: 'File and target path are required' }, { status: 400 });
    }

    // console.log(`🔍 DEBUG: Uploading file to: ${targetPath}`);

    // Get environment variables
    const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
    const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
    const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

    if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
      return NextResponse.json(
        { error: 'CML environment variables not configured' },
        { status: 500 },
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create temporary file
    const tempDir = '/tmp';
    const tempFileName = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    try {
      // Write file to temporary location
      await writeFile(tempFilePath, buffer);

      const agent = createAgent();
      const scheme = getUrlScheme();
      const uploadUrl = `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/files`;

      // Create multipart form data manually to match testagi.py pattern
      const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
      const fileContent = fs.readFileSync(tempFilePath);

      // Build form data parts
      const parts = [];

      // Add file part with target path as field name (like testagi.py)
      parts.push(`--${boundary}`);
      parts.push(
        `Content-Disposition: form-data; name="${targetPath}"; filename="${path.basename(targetPath)}"`,
      );
      parts.push('Content-Type: application/octet-stream');
      parts.push('');

      // Create the complete form data
      const formDataStart = parts.join('\r\n') + '\r\n';
      const formDataEnd = `\r\n--${boundary}--\r\n`;

      const formDataBuffer = Buffer.concat([
        Buffer.from(formDataStart, 'utf8'),
        fileContent,
        Buffer.from(formDataEnd, 'utf8'),
      ]);

      // console.log(`🔍 DEBUG: Upload boundary: ${boundary}`);
      // console.log(`🔍 DEBUG: Upload URL: ${uploadUrl}`);
      // console.log(`🔍 DEBUG: Target path field name: ${targetPath}`);

      // Upload using direct HTTP request (POST create, fallback to PUT overwrite on conflict)
      let uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CDSW_APIV2_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formDataBuffer,
        agent,
      });

      console.log(`Upload response status: ${uploadResponse.status}`);

      if (uploadResponse.ok) {
        console.log(`✅ Successfully uploaded file to ${targetPath}`);

        return NextResponse.json({
          success: true,
          path: targetPath,
          message: 'File uploaded successfully',
        });
      } else if (uploadResponse.status === 409) {
        // Conflict: try PUT to overwrite existing file
        console.log('Upload conflict (409). Retrying with PUT to overwrite...');
        uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${CDSW_APIV2_KEY}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: formDataBuffer,
          agent,
        });

        console.log(`PUT upload response status: ${uploadResponse.status}`);
        if (uploadResponse.ok) {
          console.log(`✅ Successfully overwrote file at ${targetPath}`);
          return NextResponse.json({
            success: true,
            path: targetPath,
            message: 'File uploaded successfully (overwritten)',
          });
        }

        const errorText = await uploadResponse.text();
        console.error('Upload (PUT) failed:', errorText);
        return NextResponse.json(
          { error: 'Failed to upload file to CML', details: errorText },
          { status: uploadResponse.status },
        );
      } else {
        const errorText = await uploadResponse.text();
        console.error('Upload failed:', errorText);

        return NextResponse.json(
          { error: 'Failed to upload file to CML', details: errorText },
          { status: uploadResponse.status },
        );
      }
    } catch (uploadError) {
      console.error('Upload error:', uploadError);

      return NextResponse.json(
        { error: 'Failed to upload file', details: getErrorMessage(uploadError) },
        { status: 500 },
      );
    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
    }
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
