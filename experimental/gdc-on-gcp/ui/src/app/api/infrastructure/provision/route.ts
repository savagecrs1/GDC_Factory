import { NextResponse } from 'next/server';
import { runDeploymentSequence, runDestroySequence, getJob, killJob } from '@/lib/deployment-runner';
import { addAuditLog } from '@/lib/k8s-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId') || 'default';
  return NextResponse.json(getJob(jobId));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, clusterName, deployEdgeRouter = false, machineType = 'n2-standard-32', ipMode = 'internal', jobId = 'default', billingAccountId = '' } = body;

    if (!projectId || !clusterName) {
      return NextResponse.json({ error: 'Project ID and Cluster Name are required.' }, { status: 400 });
    }

    const job = getJob(jobId);
    if (job.status === 'running') {
      return NextResponse.json({ error: 'A deployment is already running.', job }, { status: 409 });
    }

    // Launch background deployment sequence
    runDeploymentSequence(projectId, clusterName, deployEdgeRouter, machineType, ipMode, jobId, billingAccountId).catch((err) => {
      console.error('Background deployment sequence error:', err);
    });

    addAuditLog('Deploy Cluster', clusterName, `Initiated automation deployment for ${clusterName} in project ${projectId}`, 'success');

    return NextResponse.json({ success: true, message: 'Deployment sequence initiated.', job: getJob(jobId) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start deployment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { projectId, clusterName, deployEdgeRouter = false, machineType = 'n2-standard-32', ipMode = 'internal', jobId = 'default' } = body;

    if (!projectId || !clusterName) {
      return NextResponse.json({ error: 'Project ID and Cluster Name are required.' }, { status: 400 });
    }

    const job = getJob(jobId);
    if (job.status === 'running') {
      return NextResponse.json({ error: 'An automation job is already running.', job }, { status: 409 });
    }

    // Launch background destroy sequence
    runDestroySequence(projectId, clusterName, deployEdgeRouter, machineType, ipMode, jobId).catch((err) => {
      console.error('Background destroy sequence error:', err);
    });

    addAuditLog('Destroy Cluster', clusterName, `Initiated teardown automation for ${clusterName} in project ${projectId}`, 'info');

    return NextResponse.json({ success: true, message: 'Teardown sequence initiated.', job: getJob(jobId) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start teardown' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { jobId = 'default' } = body;
    const success = killJob(jobId);
    return NextResponse.json({ success, message: success ? 'Automation job forcibly terminated.' : 'Job was not running.', job: getJob(jobId) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to stop job' }, { status: 500 });
  }
}
