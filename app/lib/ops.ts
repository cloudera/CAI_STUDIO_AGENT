import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import fs from 'fs';

interface Application {
  name: string;
  subdomain: string;
  status: string;
}

interface ListApplicationsResponse {
  applications: Application[];
}

export const createAgent = () => {
  const isTlsEnabled = process.env.AGENT_STUDIO_WORKBENCH_TLS_ENABLED === 'true';

  if (isTlsEnabled) {
    return new https.Agent({
      ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt'),
    });
  } else {
    return new http.Agent();
  }
};

export const getUrlScheme = () => {
  return process.env.AGENT_STUDIO_WORKBENCH_TLS_ENABLED === 'true' ? 'https' : 'http';
};

export const base64Encode = (obj: any): string => {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
};

export const fetchModelUrl = async (cml_model_id: string): Promise<string | null> => {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    console.error('Environment variables are not set properly.');
    return null;
  }

  const agent = createAgent();
  const scheme = getUrlScheme();

  try {
    const response = await fetch(
      `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/models/${cml_model_id}`,
      {
        headers: {
          authorization: `Bearer ${CDSW_APIV2_KEY}`,
        },
        agent,
      },
    );
    const responseData = (await response.json()) as any;

    const outputURL = `${scheme}://modelservice.${CDSW_DOMAIN}/model?accessKey=${responseData.access_key}`;
    return outputURL;
  } catch (error) {
    console.error('Error fetching model URL:', error);
    return null;
  }
};

export const fetchOpsUrl = async (): Promise<string | null> => {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (!CDSW_APIV2_KEY || !CDSW_DOMAIN || !CDSW_PROJECT_ID) {
    console.error('Environment variables are not set properly.');
    return null;
  }

  const agent = createAgent();
  const scheme = getUrlScheme();

  try {
    const response = await fetch(
      `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/applications?page_size=500`,
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

    const outputURL = `${scheme}://${application.subdomain}.${CDSW_DOMAIN}`;
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
  const agent = createAgent();

  if (process.env.AGENT_STUDIO_LEGACY_WORKFLOW_APP === 'true') {
    const opsUrl = await fetchOpsUrl();
    const response = await fetch(`${opsUrl}/events?trace_id=${traceId}`, {
      headers: {
        authorization: `Bearer ${process.env.CDSW_APIV2_KEY}`,
      },
      agent,
    });
    const { events } = (await response.json()) as any;
    return events;
  } else {
    const response = await fetch(`http://localhost:50052/events?trace_id=${traceId}`);
    const { events } = (await response.json()) as any;
    return events;
  }
};
