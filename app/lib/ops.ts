import { GraphQLClient } from 'graphql-request';
import fetch from 'node-fetch';
import https from 'https';
import fs from 'fs';

interface Application {
  name: string;
  subdomain: string;
  status: string;
}

interface ListApplicationsResponse {
  applications: Application[];
}

export const fetchOpsUrl = async (): Promise<string | null> => {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    console.error('Environment variables are not set properly.');
    return null;
  }

  // Use the CA bundle
  const agent = new https.Agent({
    ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
  });

  try {
    const response = await fetch(
      `https://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/applications?page_size=100`,
      {
        headers: {
          authorization: `Bearer ${CDSW_APIV2_KEY}`,
        },
        agent,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch applications: ${response.statusText}`);
    }

    const data = (await response.json()) as ListApplicationsResponse;

    // Find the most recent running version of Agent Studio
    const runningApps = data.applications.filter(
      (app: { name: string; status: string }) =>
        app.name.toLowerCase().includes('agent studio - agent ops & metrics') &&
        app.status.toLowerCase().includes('running'),
    );

    if (runningApps.length === 0) {
      console.error("No running 'Agent Studio - Agent Ops & Metrics' applications found.");
      return null;
    }

    // Sort by version if present (assuming format "Name vX.Y")
    const getVersion = (appName: string): number[] => {
      try {
        const version = appName.split('v').pop() || '';
        return version.split('.').map(Number);
      } catch {
        return [0, 0]; // Default for apps without version
      }
    };

    // Get the most recent version
    const application = runningApps.sort((a, b) => {
      const vA = getVersion(a.name);
      const vB = getVersion(b.name);
      return vB[0] - vA[0] || vB[1] - vA[1];
    })[0];

    if (!application) {
      console.error("No suitable 'Agent Studio - Agent Ops & Metrics' application found.");
      return null;
    }

    const outputURL = `https://${application.subdomain}.${CDSW_DOMAIN}`;
    return outputURL;
  } catch (error) {
    console.error('Error fetching applications:', error);
    return null;
  }
};

/**
 * Get all crew events given a specific crew Trace. It's assumed that the
 * traceId is the "local" trace ID that was passed from the crew kickoff call.
 */
export const getCrewEvents = async (traceId: string) => {
  // Use the CA bundle
  const agent = new https.Agent({
    ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
  });
  const opsUrl = await fetchOpsUrl();
  const response = await fetch(`${opsUrl}/events?trace_id=${traceId}`, {
    headers: {
      authorization: `Bearer ${process.env.CDSW_APIV2_KEY}`,
    },
    agent,
  });

  const events: any[] = (await response.json()) as any;
  return events;
};
