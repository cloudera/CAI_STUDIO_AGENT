import { fetchOpsUrl } from '@/app/lib/ops';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  if (process.env.AGENT_STUDIO_DEPLOYMENT_CONFIG === 'dev') {
    return NextResponse.json({ ops_display_url: 'http://127.0.0.1:8123' });
  } else {
    return NextResponse.json({ ops_display_url: await fetchOpsUrl() });
  }
}
