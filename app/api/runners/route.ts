import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';



export async function GET(request: NextRequest) {
  
  const numRunners = parseInt(process.env.AGENT_STUDIO_NUM_WORKFLOW_RUNNERS as string);
  const firstPort = 51000;


  // Build an array of fetch Promises
  const statusPromises: Promise<any>[] = [];
  for (let i = 0; i < numRunners; i++) {
    const port = firstPort + i;
    const url = `http://localhost:${port}/status`;

    // Wrap each request in a promise that captures the port and either the status or error
    const promise = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const statusData = await response.json();
        return {
           endpoint: `http://localhost:${port}`, 
           status: statusData 
        };
      })
      .catch((error: Error) => {
        return { port, error: error.message };
      });

    statusPromises.push(promise);
  }

  // Resolve all fetch calls
  const results = await Promise.all(statusPromises);
  return NextResponse.json(results)
}
