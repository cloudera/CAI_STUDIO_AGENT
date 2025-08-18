import { NextRequest, NextResponse } from 'next/server';
//



const getUrlScheme = () => {
  return process.env.AGENT_STUDIO_WORKBENCH_TLS_ENABLED === 'true' ? 'https' : 'http';
};

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const PROJECT_OWNER = process.env.PROJECT_OWNER;
  const CDSW_PROJECT = process.env.CDSW_PROJECT;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  if (!CDSW_DOMAIN || !PROJECT_OWNER || !CDSW_PROJECT) {
    return NextResponse.json({ error: 'Missing CML configuration' }, { status: 500 });
  }

  const scheme = getUrlScheme();

  try {
    // Construct the CML files URL using environment variables
    const baseUrl = `${scheme}://${CDSW_DOMAIN}`;
    const filesUrlBase = `${baseUrl}/${PROJECT_OWNER}/${CDSW_PROJECT}/files`;

    return NextResponse.json(
      {
        scheme,
        domain: CDSW_DOMAIN,
        projectOwner: PROJECT_OWNER,
        projectName: CDSW_PROJECT,
        projectId: CDSW_PROJECT_ID,
        filesUrlBase,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error getting project URL:', error);
    return NextResponse.json({ error: 'Failed to get project URL' }, { status: 500 });
  }
}
