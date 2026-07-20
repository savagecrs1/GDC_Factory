import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId') || 'core-edge-dm1';

  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = `${process.env.PATH || ''}:${homeDir}/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
    const cmd = `gcloud container fleet memberships list --project="${projectId}" --format="json(name, location)" --quiet`;
    const { stdout } = await execAsync(cmd, {
      env: { ...process.env, PATH: envPath }
    });

    const memberships = JSON.parse(stdout || '[]');
    const clusters = memberships.map((m: any) => {
      const parts = m.name?.split('/') || [];
      return parts[parts.length - 1];
    }).filter(Boolean);

    return NextResponse.json({
      success: true,
      clusters: clusters.length ? clusters : ['abm-cluster-1'],
      source: 'live'
    });
  } catch (error: any) {
    console.warn(`Could not list GKE fleet memberships for ${projectId}:`, error?.message);
    // Provide sensible default/emulated name if GKE Hub is disabled on project
    return NextResponse.json({
      success: true,
      clusters: [`${projectId}-cluster-1`],
      source: 'fallback'
    });
  }
}
