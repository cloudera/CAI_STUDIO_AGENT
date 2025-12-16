import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { createAgent, getUrlScheme } from '@/app/lib/ops';

export async function GET(_request: NextRequest) {
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
    deploy_mode: process.env.AGENT_STUDIO_DEPLOY_MODE || 'amp',
  };
  return NextResponse.json(out);
}
