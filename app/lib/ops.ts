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

/**
 * Get a global trace ID from a local hex trace ID. Phoenix GraphQL does not
 * allow to search for projects by a project ID or by project name, but the
 * endpoint DOES allow us to get individual nodes by their "global ID". We use
 * this query to get the global ID of the trace whose "local" ID (predefined
 * as the actual trace ID of the span context) matches the trace ID returned
 * when kicking off a crew.
 */
const getProjectAndTraceInfo = async (client: GraphQLClient, traceId: string) => {
  const query = `
query QueryProjectsForTraceExistence {
  projects(first: 1000) {
    edges {
      node {
        id
        trace(traceId: "${traceId}") {
          id
        }
      }
    }
  }
}
  `;
  const data: any = await client.request(query);
  const project: any = data.projects.edges.find((edge: any) => edge.node.trace?.id);
  const globalTraceId: string = project.node.trace.id;
  return {
    projectId: project.node.id,
    globalTraceId: globalTraceId,
  };
};

const eventTypes = [
  'Crew.kickoff',
  'Agent._start_task',
  'completion',
  'ToolUsage._use',
  'ToolUsage._end_use',
  'Agent._end_task',
  'Crew.complete',
];

/**
 * Get all crew events given a specific crew Trace. It's assumed that the
 * traceId is the "local" trace ID that was passed from the crew kickoff call.
 */
export const getCrewEvents = async (client: GraphQLClient, traceId: string) => {
  // Get the global trace ID
  const { projectId, globalTraceId } = await getProjectAndTraceInfo(client, traceId);

  // Query the global trace ID
  const query = `
query MyQuery {
  node(id: "${globalTraceId}") {
    ... on Trace {
      rootSpan {
        name
        descendants {
          id
          name
          startTime
          cumulativeTokenCountTotal
          cumulativeTokenCountPrompt
          cumulativeTokenCountCompletion
          endTime
          attributes
          events {
            message
            name
            timestamp
          }
        }
      }
    }
  }
}
  `;
  const data: any = await client.request(query);
  const events: any[] = [];
  data.node.rootSpan.descendants.map((descendant: any) => {
    if (eventTypes.includes(descendant.name)) {
      events.push({
        ...descendant,
        attributes: JSON.parse(descendant.attributes),
        events: descendant.events || [],
      });
    }
    return;
  });

  // Sort the data by startTime in ascending order
  const sortedEvents = events.sort((a: any, b: any) => {
    const dateA = new Date(a.startTime);
    const dateB = new Date(b.startTime);
    return dateA.getTime() - dateB.getTime(); // Compare timestamps
  });

  return {
    projectId: projectId,
    events: sortedEvents,
  };
};

export const fetchOpsUrl = async (): Promise<string | null> => {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (process.env.AGENT_STUDIO_DEPLOYMENT_CONFIG === 'dev') {
    return 'http://127.0.0.1:8123';
  }

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
      `https://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/applications`,
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
