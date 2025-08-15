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

  const filePath = request.nextUrl.searchParams.get('filePath');

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

  try {
    const response = await fetch(apiUrl, {
      method: 'POST', // CML download endpoint requires POST
      headers: {
        Authorization: `Bearer ${CDSW_APIV2_KEY}`,
      },
      agent,
    });

    if (response.status === 200) {
      const content = await response.text();
      return NextResponse.json(
        {
          content,
          filePath,
        },
        { status: 200 },
      );
    } else {
      const errorData = await response.text();
      console.error(`Error reading file ${filePath}:`, errorData);
      return NextResponse.json(
        {
          error: `Failed to read file: ${response.status}`,
          filePath,
        },
        { status: response.status },
      );
    }
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      {
        error: 'Failed to read file',
        filePath,
      },
      { status: 500 },
    );
  }
}
