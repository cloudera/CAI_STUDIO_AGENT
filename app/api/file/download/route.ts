import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import fs from 'fs';

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

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  const filePath = request.nextUrl.searchParams.get('filePath');
  console.log('Download API - filePath param:', filePath); // Debug logging

  if (!filePath) {
    return NextResponse.json({ error: 'File path is required' }, { status: 400 });
  }

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    return NextResponse.json({ error: 'Missing CML configuration' }, { status: 500 });
  }

  const agent = createAgent();
  const scheme = getUrlScheme();

  const encodedFilePath = encodeURIComponent(filePath);
  // CML uses a specific download endpoint with POST method
  const apiUrl = `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/files/${encodedFilePath}:download`;
  console.log('Download API - CML API URL:', apiUrl); // Debug logging

  try {
    const response = await fetch(apiUrl, {
      method: 'POST', // CML download endpoint requires POST
      headers: {
        Authorization: `Bearer ${CDSW_APIV2_KEY}`,
      },
      agent,
    });

    console.log('Download API - CML response status:', response.status); // Debug logging
    console.log('Download API - CML response content-type:', response.headers.get('content-type')); // Debug logging

    if (response.status === 200) {
      // Use arrayBuffer() for proper binary handling
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Clean filename - remove special characters that cause encoding issues
      const rawFileName = filePath.split('/').pop() || 'download';
      const cleanFileName =
        rawFileName
          .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
          .replace(/\s+/g, '_') // Replace spaces with underscores
          .replace(/[<>:"/\\|?*]/g, '') || // Remove invalid filename characters
        'download';

      console.log(`🔍 DEBUG: Raw filename: "${rawFileName}"`);
      console.log(`🔍 DEBUG: Clean filename: "${cleanFileName}"`);

      // Get content type based on file extension
      const getContentType = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
          case 'txt':
            return 'text/plain';
          case 'json':
            return 'application/json';
          case 'csv':
            return 'text/csv';
          case 'log':
            return 'text/plain';
          case 'py':
            return 'text/x-python';
          case 'js':
            return 'application/javascript';
          case 'html':
            return 'text/html';
          case 'css':
            return 'text/css';
          case 'pdf':
            return 'application/pdf';
          case 'png':
            return 'image/png';
          case 'jpg':
          case 'jpeg':
            return 'image/jpeg';
          case 'gif':
            return 'image/gif';
          case 'webp':
            return 'image/webp';
          case 'svg':
            return 'image/svg+xml';
          case 'ico':
            return 'image/x-icon';
          case 'mp4':
            return 'video/mp4';
          case 'mp3':
            return 'audio/mpeg';
          case 'zip':
            return 'application/zip';
          case 'xml':
            return 'application/xml';
          case 'md':
            return 'text/markdown';
          default:
            return 'application/octet-stream';
        }
      };

      // Create headers without special characters
      const headers = new Headers();
      headers.set('Content-Type', getContentType(cleanFileName));
      headers.set('Content-Length', uint8Array.length.toString());

      // Use ASCII-safe filename in Content-Disposition
      headers.set('Content-Disposition', `attachment; filename="${cleanFileName}"`);

      // Additional headers for better compatibility
      headers.set('Cache-Control', 'no-cache');
      headers.set('X-Content-Type-Options', 'nosniff');

      console.log(`✅ Download: ${cleanFileName} (${uint8Array.length} bytes)`);

      // Use standard Response with Uint8Array for maximum compatibility
      return new Response(uint8Array, {
        status: 200,
        headers: headers,
      });
    } else {
      const errorData = await response.text();
      console.error(`Error downloading file ${filePath}:`, errorData);
      console.log('Download API - Error response body:', errorData); // Debug logging
      return NextResponse.json(
        {
          error: `Failed to download file: ${response.status}`,
          filePath,
          cmlResponse: errorData, // Include CML response for debugging
        },
        { status: response.status },
      );
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      {
        error: 'Failed to download file',
        filePath,
      },
      { status: 500 },
    );
  }
}
