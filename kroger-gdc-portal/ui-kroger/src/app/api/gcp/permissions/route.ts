import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const REQUIRED_ROLES = [
  { role: 'roles/compute.admin', label: 'Compute Engine Admin (GCE Node VMs & VPCs)' },
  { role: 'roles/iam.serviceAccountAdmin', label: 'IAM Service Account Administrator' },
  { role: 'roles/gkehub.admin', label: 'GKE Connect Fleet Hub Administrator' },
  { role: 'roles/resourcemanager.projectIamAdmin', label: 'Project IAM Policy Administrator' },
  { role: 'roles/serviceusage.serviceUsageAdmin', label: 'GCP Service Usage Administrator' },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
  }

  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = `${process.env.PATH || ''}:${homeDir}/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
    
    // Fetch active gcloud account
    let activeAccount = '';
    try {
      const { stdout: acctOut } = await execAsync('gcloud config get-value account --quiet', {
        env: { ...process.env, PATH: envPath }
      });
      activeAccount = acctOut.trim();
    } catch (e) {}

    // Get IAM Policy bindings for project
    const cmd = `gcloud projects get-iam-policy "${projectId}" --format="json" --quiet`;
    const { stdout } = await execAsync(cmd, {
      env: { ...process.env, PATH: envPath }
    });

    const policy = JSON.parse(stdout || '{}');
    const bindings = policy.bindings || [];

    // Find all roles associated with active account or project service accounts
    const userRoles = new Set<string>();
    const userMemberStr = `user:${activeAccount}`;

    bindings.forEach((b: any) => {
      const members: string[] = b.members || [];
      const isUserBound = members.some(m => m.toLowerCase() === userMemberStr.toLowerCase() || m.includes(activeAccount));
      const isOwnerOrEditor = isUserBound && (b.role === 'roles/owner' || b.role === 'roles/editor');

      if (isUserBound || isOwnerOrEditor) {
        userRoles.add(b.role);
      }
    });

    const isOwner = userRoles.has('roles/owner');
    const isEditor = userRoles.has('roles/editor');

    const checks = REQUIRED_ROLES.map((item) => {
      const hasSpecificRole = userRoles.has(item.role);
      const granted = isOwner || isEditor || hasSpecificRole;
      return {
        role: item.role,
        label: item.label,
        granted,
        inheritedFrom: isOwner ? 'roles/owner' : isEditor ? 'roles/editor' : hasSpecificRole ? item.role : null
      };
    });

    const allGranted = checks.every((c) => c.granted);

    return NextResponse.json({
      account: activeAccount || 'Unknown User',
      projectId,
      allGranted,
      isOwner,
      isEditor,
      checks,
      remediationCommand: allGranted
        ? null
        : `gcloud projects add-iam-policy-binding ${projectId} --member="user:${activeAccount || '<YOUR_EMAIL>'}" --role="roles/owner"`,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Failed to inspect GCP IAM policy',
      details: error.stderr || error.message || String(error),
    }, { status: 500 });
  }
}
