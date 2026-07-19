import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

function getActiveAccount() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = `${process.env.PATH || ''}:${homeDir}/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
    const email = execSync('gcloud config get-value account 2>/dev/null', {
      encoding: 'utf-8',
      env: { ...process.env, PATH: envPath }
    }).trim();
    if (email && email.includes('@') && email !== '(unset)') {
      return {
        authenticated: true,
        name: email.split('@')[0].replace(/[._-]/g, ' '),
        email: email,
        role: 'GDC Cluster Administrator'
      };
    }
  } catch (e) {}
  return {
    authenticated: false,
    name: 'Unauthenticated User',
    email: 'Not Logged In',
    role: 'Pending GCP Authentication'
  };
}

export async function GET() {
  const activeUser = getActiveAccount();
  return NextResponse.json({
    authenticated: activeUser.authenticated,
    user: {
      name: activeUser.name,
      email: activeUser.email,
      role: activeUser.role,
      avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
      authMethod: activeUser.authenticated ? 'Google Cloud ADC / OAuth 2.0' : 'Unauthenticated (CLI Action Required)'
    },
    project: process.env.PROJECT_ID || 'kroger-test-4',
    cluster: process.env.CLUSTER_NAME || 'autotest-1-lffv'
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ success: true, user: body });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update auth state' }, { status: 500 });
  }
}
