import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import https from 'https';
import http from 'http';
import fetch from 'node-fetch';

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

export async function GET(request: NextRequest) {
  const agent = createAgent();
  const scheme = getUrlScheme();

  const response = await fetch(`${scheme}://${process.env.CDSW_DOMAIN}/sense-bootstrap.json`, {
    headers: {
      authorization: `Bearer ${process.env.CDSW_APIV2_KEY}`,
    },
    agent,
  });
  const responseData = (await response.json()) as Record<string, unknown>;
  const out = {
    ...responseData,
  };
  return NextResponse.json(out);
}
