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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  const directoryPath = request.nextUrl.searchParams.get('directoryPath');

  if (!directoryPath) {
    return NextResponse.json({ error: 'Directory path is required' }, { status: 400 });
  }

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    return NextResponse.json({ error: 'Missing CML configuration' }, { status: 500 });
  }

  const agent = createAgent();
  const scheme = getUrlScheme();

  const encodedDirectoryPath = encodeURIComponent(directoryPath);
  const apiUrl = `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/files/${encodedDirectoryPath}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${CDSW_APIV2_KEY}`,
      },
      agent,
    });

    const responseData = (await response.json()) as any;

    if (response.status === 200) {
      if (responseData.files && responseData.files.length > 0) {
        // console.log('Raw CML API response files:', responseData.files); // Debug logging

        // Filter out directories and files with invalid names, keep only files
        const files = responseData.files
          .filter((file: any) => {
            const fileName = file.path || file.name; // CML API uses 'path' for filename
            const isValidFile =
              !file.is_dir && fileName && typeof fileName === 'string' && fileName.trim() !== '';
            if (!isValidFile) {
              console.log('Filtering out invalid file:', file);
            }
            return isValidFile;
          })
          .map((file: any) => {
            const fileName = file.path || file.name; // CML API uses 'path' for filename
            const fileSize = file.file_size ? parseInt(file.file_size) : file.size || 0; // CML API uses 'file_size'
            return {
              name: fileName,
              path: `${directoryPath}/${fileName}`,
              size: fileSize,
              lastModified: file.last_modified || null,
              isDirectory: file.is_dir || false,
            };
          });

        // console.log('Valid files being returned by API:', files); // Debug logging

        return NextResponse.json(
          {
            files,
            directoryPath,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(
      {
        files: [],
        directoryPath,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error listing directory:', error);
    return NextResponse.json(
      {
        error: 'Failed to list directory',
        files: [],
        directoryPath,
      },
      { status: 500 },
    );
  }
}
