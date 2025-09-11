import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { createAgent, getUrlScheme } from '@/app/lib/ops';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const CDSW_APIV2_KEY = process.env.CDSW_APIV2_KEY;
  const CDSW_DOMAIN = process.env.CDSW_DOMAIN;
  const CDSW_PROJECT_ID = process.env.CDSW_PROJECT_ID;

  const filePath = request.nextUrl.searchParams.get('filePath');

  if (!filePath) {
    return NextResponse.json({ exists: false }, { status: 200 });
  }

  const agent = createAgent();
  const scheme = getUrlScheme();

  const encodedFilePath = encodeURIComponent(filePath);
  const apiUrl = `${scheme}://${CDSW_DOMAIN}/api/v2/projects/${CDSW_PROJECT_ID}/files/${encodedFilePath}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${CDSW_APIV2_KEY}`,
      },
      agent,
    });
    const responseData = (await response.json()) as any;

    if (response.status === 200) {
      if (
        responseData.files &&
        responseData.files.length === 1 &&
        responseData.files[0].is_dir === false
      ) {
        return NextResponse.json({ exists: true }, { status: 200 });
      }
    }

    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (_error) {
    return NextResponse.json({ exists: false }, { status: 200 });
  }
}
