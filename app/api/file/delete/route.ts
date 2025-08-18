import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import fs from 'fs';

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
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

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

    const agent = createAgent();
    const scheme = getUrlScheme();

    // Double encode the file path to handle special characters
    const encodedFilePath = encodeURIComponent(encodeURIComponent(filePath));
    const deleteUrl = `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/files/${encodedFilePath}`;

    // console.log(`🔍 DEBUG: Deleting file: ${filePath}`);
    // console.log(`🔍 DEBUG: Delete URL: ${deleteUrl}`);

    try {
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${CDSW_APIV2_KEY}`,
          'Content-Type': 'application/json',
        },
        agent,
      });

      console.log(`Delete response status: ${deleteResponse.status}`);

      if (deleteResponse.ok) {
        console.log(`🗑️  Successfully deleted file: ${filePath}`);

        return NextResponse.json({
          success: true,
          message: 'File deleted successfully',
        });
      } else if (deleteResponse.status === 404) {
        // If file doesn't exist (404), that's okay
        console.log(`ℹ️  File not found (already deleted): ${filePath}`);
        return NextResponse.json({
          success: true,
          message: 'File not found (already deleted)',
        });
      } else {
        const errorText = await deleteResponse.text();
        console.error('Delete failed:', errorText);

        return NextResponse.json(
          { error: 'Failed to delete file', details: errorText },
          { status: deleteResponse.status },
        );
      }
    } catch (deleteError) {
      console.error('Delete request error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete file', details: getErrorMessage(deleteError) },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('File delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete file', details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
