import { NextRequest, NextResponse } from 'next/server';
import { getCrewEvents } from '@/app/lib/ops';

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get('trace_id');

  if (!traceId) {
    return NextResponse.json({
      events: [],
    });
  }

  const events = await getCrewEvents(traceId);
  return NextResponse.json({
    events: events,
  });
}
