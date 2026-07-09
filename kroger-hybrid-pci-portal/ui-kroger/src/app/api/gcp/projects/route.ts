import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const envPath = `${process.env.PATH || ''}:/Users/chrissavage/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin`;
    const { stdout } = await execAsync('gcloud projects list --limit=50 --format="json(projectId, name)"', {
      env: { ...process.env, PATH: envPath }
    });
    const projects = JSON.parse(stdout);
    return NextResponse.json({ projects, success: true });
  } catch (error: any) {
    console.warn('Could not list GCP projects via gcloud, returning simulated list:', error?.message);
    return NextResponse.json({
      projects: [
        { projectId: 'core-edge-dm1', name: 'core-edge-dm1 (Argolis Primary)' },
        { projectId: 'core-edge-dm2', name: 'core-edge-dm2 (Argolis Secondary)' },
        { projectId: 'core-edge-dm3', name: 'core-edge-dm3 (Argolis Tertiary)' },
        { projectId: 'core-edge-rhel', name: 'core-edge-rhel (RHEL Workloads)' },
        { projectId: 'vdc-18818', name: 'vdc-18818 (Demo Environment)' },
      ],
      success: true,
      source: 'fallback'
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, name } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const envPath = `${process.env.PATH || ''}:/Users/chrissavage/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin`;
    const displayName = name || projectId;

    const cmd = `gcloud projects create "${projectId}" --name="${displayName}"`;
    await execAsync(cmd, { env: { ...process.env, PATH: envPath } });

    return NextResponse.json({
      success: true,
      project: { projectId, name: displayName },
      message: `GCP Project "${projectId}" created successfully!`
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message || 'Failed to create GCP project',
    }, { status: 500 });
  }
}
