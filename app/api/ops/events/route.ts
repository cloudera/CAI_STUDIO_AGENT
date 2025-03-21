import { NextRequest, NextResponse } from 'next/server';
import { GraphQLClient } from 'graphql-request';
import { fetchOpsUrl, getCrewEvents } from '@/app/lib/ops';
import fetch from 'node-fetch';
import fs from 'fs';
import https from 'https';

// Use the CA bundle
const agent = new https.Agent({
  ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
});

// Custom fetch function that uses the agent
const customFetch = (url: any, options: any) => {
  return fetch(url, { ...options, agent }) as unknown as Promise<Response>;
};

const getGraphQLClient = async () => {
  const opsUrl = await fetchOpsUrl();

  if (process.env.AGENT_STUDIO_DEPLOYMENT_CONFIG === 'dev') {
    return new GraphQLClient(`${opsUrl}/graphql`, {
      headers: {
        Authorization: `Bearer ${process.env.CDSW_APIV2_KEY}`,
      },
    });
  } else {
    return new GraphQLClient(`${opsUrl}/graphql`, {
      headers: {
        Authorization: `Bearer ${process.env.CDSW_APIV2_KEY}`,
      },
      fetch: customFetch,
    });
  }
};

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get('traceId');

  if (!traceId) {
    return NextResponse.json({
      events: [],
    });
  }

  const client = await getGraphQLClient();

  const { projectId, events } = await getCrewEvents(client, traceId);
  // console.log(sortedEvents);

  return NextResponse.json({
    projectId: projectId,
    events: events,
  });
}
