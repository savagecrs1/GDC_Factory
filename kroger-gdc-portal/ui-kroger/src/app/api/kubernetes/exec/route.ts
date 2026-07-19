import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { addAuditLog } from '@/lib/k8s-client';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetType, targetName, namespace = 'default', command = 'whoami', projectId = 'vdc-18818', zone = 'us-central1-a' } = body;

    if (!targetName) {
      return NextResponse.json({ error: 'Target name is required' }, { status: 400 });
    }

    let fullCmd = '';

    const targetGcpProject = (projectId === 'core-edge-dm1' || !projectId || projectId === 'undefined') ? 'vdc-18818' : projectId;
    const controlPlaneNode = `${targetGcpProject}-cluster-1-node-1`;

    if (targetType === 'node') {
      // SSH into physical GCE cluster node over IAP
      const escapedCmd = command.replace(/'/g, "'\\''");
      fullCmd = `export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/google-cloud-sdk/bin"; gcloud compute ssh ${targetName} --project=${targetGcpProject} --zone=${zone} --tunnel-through-iap --command='${escapedCmd}'`;
    } else if (targetType === 'vm') {
      // Execute command inside KubeVirt VM domain pod via physical cluster node-1
      const k8sCmd = `POD=$(sudo kubectl --kubeconfig /etc/kubernetes/admin.conf get pod -n ${namespace} -l vm.kubevirt.io/name=${targetName} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null); if [ -n "$POD" ]; then sudo kubectl --kubeconfig /etc/kubernetes/admin.conf exec -i -n ${namespace} "$POD" -c compute -- ${command}; else echo "❌ Error: KubeVirt VM pod for '${targetName}' not found in namespace '${namespace}'."; fi`;
      fullCmd = `export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/google-cloud-sdk/bin"; gcloud compute ssh ${controlPlaneNode} --project=${targetGcpProject} --zone=${zone} --tunnel-through-iap --command='${k8sCmd.replace(/'/g, "'\\''")}'`;
    } else {
      // Exec into Kubernetes pod via control plane node-1
      const escapedCmd = command.replace(/'/g, "'\\''");
      fullCmd = `export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/google-cloud-sdk/bin"; gcloud compute ssh ${controlPlaneNode} --project=${targetGcpProject} --zone=${zone} --tunnel-through-iap --command='sudo kubectl --kubeconfig /etc/kubernetes/admin.conf exec -i -n ${namespace} ${targetName} -- ${escapedCmd}'`;
    }

    try {
      const { stdout, stderr } = await execAsync(fullCmd, { timeout: 30000 });
      const cleanOutput = (stdout || stderr || '').replace(/WARNING:[\s\S]*?bandwidth\n\n?/g, '').trim();
      addAuditLog('Terminal Exec', targetName, `Ran command: ${command.slice(0, 40)}...`, 'info');
      return NextResponse.json({
        success: true,
        output: cleanOutput || 'Command executed cleanly with no output.',
        executedCommand: fullCmd
      });
    } catch (err: any) {
      const cleanStdout = (err.stdout || '').replace(/WARNING:[\s\S]*?bandwidth\n\n?/g, '').trim();
      const cleanStderr = (err.stderr || '').replace(/WARNING:[\s\S]*?bandwidth\n\n?/g, '').trim();
      const cleanOutput = cleanStdout || cleanStderr || err.message?.replace(/Command failed:[\s\S]*?\n/, '').trim() || 'Command returned non-zero exit code (Command failed or not found).';
      addAuditLog('Terminal Exec', targetName, `Failed command: ${command.slice(0, 40)}...`, 'error');
      return NextResponse.json({
        success: false,
        output: cleanOutput,
        executedCommand: fullCmd
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to process exec request' }, { status: 500 });
  }
}
