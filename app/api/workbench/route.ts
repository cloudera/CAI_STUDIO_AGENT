import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import https from 'https';
import fetch from 'node-fetch';

const agent = new https.Agent({
  ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
});

export async function GET(request: NextRequest) {
  const response = await fetch(`https://${process.env.CDSW_DOMAIN}/sense-bootstrap.json`, {
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
