import { fetchOpsUrl } from '@/app/lib/ops';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  if (process.env.AGENT_STUDIO_LEGACY_WORKFLOW_APP === 'false') {
    return NextResponse.json({ ops_display_url: '/api/ops' });
  } else {
    return NextResponse.json({ ops_display_url: await fetchOpsUrl() });
  }
}
