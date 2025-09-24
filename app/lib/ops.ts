import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import fs from 'fs';

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

/**
 * Get all crew events given a specific crew Trace. It's assumed that the
 * traceId is the "local" trace ID that was passed from the crew kickoff call.
 */
export const getCrewEvents = async (traceId: string) => {
  const response = await fetch(`http://localhost:50052/events?trace_id=${traceId}`);
  const { events } = (await response.json()) as any;
  return events;
};
