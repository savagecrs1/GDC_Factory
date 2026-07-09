import { NextResponse } from 'next/server';

// In-memory mock session store for Google OAuth simulation / local ADC fallback
let session = {
  authenticated: true,
  user: {
    name: 'Chris Savage (Argolis Admin)',
    email: 'admin@chrissavage.altostrat.com',
    avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    role: 'Argolis GDC Cluster Administrator',
    authMethod: 'Argolis GCP OAuth 2.0 / ADC Token'
  },
  project: process.env.PROJECT_ID || 'core-edge-dm1',
  cluster: process.env.CLUSTER_NAME || 'abm-cluster-1'
};

export async function GET() {
  return NextResponse.json(session);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === 'logout') {
      session.authenticated = false;
      return NextResponse.json({ success: true, authenticated: false });
    }
    if (body.action === 'login') {
      session.authenticated = true;
      if (body.project) session.project = body.project;
      if (body.cluster) session.cluster = body.cluster;
      return NextResponse.json({ success: true, session });
    }
    if (body.project || body.cluster) {
      if (body.project) session.project = body.project;
      if (body.cluster) session.cluster = body.cluster;
      return NextResponse.json({ success: true, session });
    }
    return NextResponse.json({ error: 'Invalid auth action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process auth request' }, { status: 500 });
  }
}
