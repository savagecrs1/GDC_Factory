import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { analyzeError } from './ai-watchdog';

// Ensure standard CLI paths are available for bash/terraform/ansible execution
process.env.PATH = `${process.env.PATH || ''}:/Users/chrissavage/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin`;

export interface LogLine {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'command';
  message: string;
  step?: string;
}

export interface DeploymentJob {
  id: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  currentStep: string;
  logs: LogLine[];
  listeners: ((line: LogLine) => void)[];
  process?: ChildProcess;
}

// Global in-memory job store for SSE subscriptions
const jobs: Record<string, DeploymentJob> = {
  default: {
    id: 'default',
    status: 'idle',
    currentStep: 'Ready',
    logs: [],
    listeners: [],
  },
};

function saveJobToDisk(job: DeploymentJob) {
  try {
    const filePath = path.join('/tmp', `gdc_job_${job.id}.json`);
    const cleanJob = { id: job.id, status: job.status, currentStep: job.currentStep, logs: job.logs };
    fs.writeFileSync(filePath, JSON.stringify(cleanJob, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not save job to disk:', e);
  }
}

export function getJob(jobId = 'default'): DeploymentJob {
  if (!jobs[jobId] || (jobs[jobId].status === 'idle' && jobs[jobId].logs.length === 0)) {
    let restoredJob: Partial<DeploymentJob> = {};
    try {
      const filePath = path.join('/tmp', `gdc_job_${jobId}.json`);
      if (fs.existsSync(filePath)) {
        restoredJob = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      console.warn('Could not restore job from disk:', e);
    }
    jobs[jobId] = {
      id: jobId,
      status: restoredJob.status || 'idle',
      currentStep: restoredJob.currentStep || 'Ready',
      logs: restoredJob.logs || [],
      listeners: jobs[jobId]?.listeners || [],
      process: jobs[jobId]?.process,
    };
  }
  return jobs[jobId];
}

export function subscribeToJob(jobId = 'default', listener: (line: LogLine) => void) {
  const job = getJob(jobId);
  job.listeners.push(listener);
  return () => {
    job.listeners = job.listeners.filter((l) => l !== listener);
  };
}

export function appendLog(job: DeploymentJob, level: LogLine['level'], message: string, step?: string) {
  const line: LogLine = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    level,
    message: message.trim(),
    step: step || job.currentStep,
  };
  job.logs.push(line);
  job.listeners.forEach((listener) => listener(line));
  saveJobToDisk(job);
}

function resourceExistsInGcp(resourceType: 'instance' | 'bucket' | 'network', name: string, project: string): boolean {
  try {
    if (resourceType === 'instance') {
      execSync(`gcloud compute instances describe ${name} --project=${project} --zone=us-central1-a --quiet`, { stdio: 'ignore' });
    } else if (resourceType === 'bucket') {
      execSync(`gcloud storage buckets describe gs://${name} --quiet`, { stdio: 'ignore' });
    } else if (resourceType === 'network') {
      execSync(`gcloud compute networks describe ${name} --project=${project} --quiet`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

export async function runDeploymentSequence(
  projectId: string,
  clusterName: string,
  deployEdgeRouter: boolean = false,
  machineType: string = 'n2-standard-32',
  ipMode: string = 'internal',
  jobId = 'default',
  billingAccountId = '0150AE-F3AB84-9BC087'
) {
  const job = getJob(jobId);
  job.status = 'running';
  job.logs = [];
  const rootDir = path.resolve(process.cwd(), '..');
  const saEmail = `tf-provisioner@${projectId}.iam.gserviceaccount.com`;

  try {
    // Step 1: Project Setup (IAM & API Enablement)
    job.currentStep = 'Step 1: GCP Project & IAM Setup (project-setup.sh)';
    appendLog(job, 'info', `Executing project-setup.sh for ${projectId} (Billing Account: ${billingAccountId})...`, job.currentStep);
    await executeCommand('./project-setup.sh', [projectId], rootDir, { PROJECT_ID: projectId, BILLING_ACCOUNT_ID: billingAccountId }, job);

    // Step 2a: Foundation Layer
    job.currentStep = 'Step 2a: Deploying Foundation (terraform/foundation)';
    appendLog(job, 'info', 'Initializing Terraform for foundation layer...', job.currentStep);
    const tfFoundationDir = path.join(rootDir, 'terraform', 'foundation');
    
    await executeCommand('terraform', [
      'init',
      '-reconfigure',
      `-backend-config=bucket=gem-${projectId}-tfstate`,
      '-backend-config=prefix=foundation/state',
      `-backend-config=impersonate_service_account=${saEmail}`
    ], tfFoundationDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    appendLog(job, 'info', 'Applying Terraform foundation layer...', job.currentStep);
    await executeCommand('terraform', ['apply', '-auto-approve'], tfFoundationDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 2b: Admin Workstation Layer
    job.currentStep = 'Step 2b: Checking Admin Workstation (terraform/admin-workstation)';
    const tfWsDir = path.join(rootDir, 'terraform', 'admin-workstation');
    appendLog(job, 'info', 'Initializing Terraform for local admin workstation layer...', job.currentStep);
    await executeCommand('terraform', [
      'init',
      '-reconfigure',
      `-backend-config=bucket=gem-${projectId}-tfstate`,
      '-backend-config=prefix=admin-workstation/state',
      `-backend-config=impersonate_service_account=${saEmail}`
    ], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    appendLog(job, 'info', 'Applying Terraform admin workstation layer...', job.currentStep);
    await executeCommand('terraform', ['apply', '-auto-approve'], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 2c: Edge Router Layer (Optional)
    if (deployEdgeRouter) {
      job.currentStep = 'Step 2c: Deploying Edge Router (terraform/edge-router)';
      appendLog(job, 'info', 'Initializing Terraform for edge router layer...', job.currentStep);
      const tfEdgeDir = path.join(rootDir, 'terraform', 'edge-router');
      
      await executeCommand('terraform', [
        'init',
        '-reconfigure',
        `-backend-config=bucket=gem-${projectId}-tfstate`,
        '-backend-config=prefix=edge-router/state',
        `-backend-config=impersonate_service_account=${saEmail}`
      ], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

      appendLog(job, 'info', 'Applying Terraform edge router layer...', job.currentStep);
      await executeCommand('terraform', ['apply', '-auto-approve'], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    }

    // Step 3: Cluster VMs Layer
    job.currentStep = `Step 3: Provisioning Cluster VMs (${clusterName})`;
    appendLog(job, 'info', `Initializing Terraform for cluster layer (${clusterName})...`, job.currentStep);
    const tfClusterDir = path.join(rootDir, 'terraform', 'cluster');
    
    await executeCommand('terraform', [
      'init',
      '-reconfigure',
      `-backend-config=bucket=gem-${projectId}-tfstate`,
      `-backend-config=prefix=clusters/${clusterName}/state`,
      `-backend-config=impersonate_service_account=${saEmail}`
    ], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    appendLog(job, 'info', `Applying Terraform cluster VMs (${machineType}, ${ipMode} IP mode)...`, job.currentStep);
    await executeCommand('terraform', [
      'apply',
      '-auto-approve',
      `-var=cluster_name=${clusterName}`,
      `-var=machine_type=${machineType}`
    ], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 4: Ansible Workstation Preparation
    job.currentStep = 'Step 4: Configuring Workstation Software (ansible/admin-workstation.yaml)';
    appendLog(job, 'info', 'Running Ansible admin-workstation.yaml (installing Docker, Helm, bmctl)...', job.currentStep);
    const ansibleDir = path.join(rootDir, 'ansible');
    await executeCommand('ansible-playbook', ['admin-workstation.yaml'], ansibleDir, { GCP_PROJECT_ID: projectId, TARGET_CLUSTER_NAME: clusterName }, job);

    // Step 5: Ansible bmctl Cluster Creation
    job.currentStep = `Step 5: Deploying Anthos Bare Metal Cluster via bmctl (create-cluster.yaml)`;
    appendLog(job, 'info', `Running Ansible create-cluster.yaml for ${clusterName}...`, job.currentStep);
    await executeCommand('ansible-playbook', ['create-cluster.yaml', '-e', `tf_cluster_name=${clusterName}`], ansibleDir, { GCP_PROJECT_ID: projectId, TARGET_CLUSTER_NAME: clusterName }, job);

    job.status = 'success';
    job.currentStep = 'Completed Successfully';
    appendLog(job, 'success', `🎉 Virtual GDC Cluster "${clusterName}" deployed and registered successfully!`, 'Completed');
  } catch (error: any) {
    job.status = 'failed';
    job.currentStep = 'Failed';
    appendLog(job, 'error', `Deployment Error: ${error.message || error}`, 'Failed');
    try {
      analyzeError(job.currentStep || 'Infrastructure Provisioning', job.logs.map(l => l.message), projectId);
    } catch (e) {
      console.error('Watchdog analysis error:', e);
    }
  }
}

export async function runDestroySequence(
  projectId: string,
  clusterName: string,
  deployEdgeRouter: boolean = false,
  machineType: string = 'n2-standard-32',
  ipMode: string = 'internal',
  jobId = 'default'
) {
  const job = getJob(jobId);
  job.status = 'running';
  job.logs = [];
  const rootDir = path.resolve(process.cwd(), '..');
  const saEmail = `tf-provisioner@${projectId}.iam.gserviceaccount.com`;

  try {
    // Notify GitOps Config Sync store that cluster is being torn down
    try {
      const syncStore = path.join('/tmp', `gdc_configsync_${projectId}_${clusterName}.json`);
      if (fs.existsSync(syncStore)) fs.unlinkSync(syncStore);
    } catch (e) {
      console.warn('Could not clear configsync store:', e);
    }

    // Unregister GKE Connect membership so subsequent loop iterations don't fail with E000025
    try {
      appendLog(job, 'info', `Unregistering GKE Connect membership for ${clusterName}...`, 'Step 1: Destroying Cluster VMs');
      execSync(`gcloud container hub memberships delete ${clusterName} --quiet --project=${projectId} 2>/dev/null || gcloud container hub memberships unregister ${clusterName} --gke-cluster=us-central1/${clusterName} --quiet --project=${projectId} 2>/dev/null || true`);
    } catch (e) {
      console.warn('Could not unregister hub membership:', e);
    }

    // Step 1: Destroy Cluster VMs
    job.currentStep = `Step 1: Destroying Cluster VMs for ${clusterName}`;
    const tfClusterDir = path.join(rootDir, 'terraform', 'cluster');
    appendLog(job, 'warn', `Destroying cluster VM hardware footprint (${clusterName})...`, job.currentStep);
    await executeCommand('terraform', [
      'init',
      '-reconfigure',
      `-backend-config=bucket=gem-${projectId}-tfstate`,
      `-backend-config=prefix=clusters/${clusterName}/state`,
      `-backend-config=impersonate_service_account=${saEmail}`
    ], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    await executeCommand('terraform', ['destroy', '-auto-approve', `-var=cluster_name=${clusterName}`, `-var=machine_type=${machineType}`], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 2: Destroy Edge Router (if present)
    if (deployEdgeRouter) {
      job.currentStep = 'Step 2: Destroying Edge Router (VXLAN Ingress Proxy)';
      const tfEdgeDir = path.join(rootDir, 'terraform', 'edge-router');
      appendLog(job, 'warn', 'Destroying edge router VM...', job.currentStep);
      await executeCommand('terraform', [
        'init',
        '-reconfigure',
        `-backend-config=bucket=gem-${projectId}-tfstate`,
        `-backend-config=prefix=edge-router/state`,
        `-backend-config=impersonate_service_account=${saEmail}`
      ], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
      await executeCommand('terraform', ['destroy', '-auto-approve'], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    }

    // Step 3: Destroy Admin Workstation
    job.currentStep = 'Step 3: Destroying Admin Workstation (gem-admin-ws)';
    const tfWsDir = path.join(rootDir, 'terraform', 'admin-workstation');
    appendLog(job, 'warn', 'Destroying admin workstation...', job.currentStep);
    await executeCommand('terraform', [
      'init',
      '-reconfigure',
      `-backend-config=bucket=gem-${projectId}-tfstate`,
      `-backend-config=prefix=admin-workstation/state`,
      `-backend-config=impersonate_service_account=${saEmail}`
    ], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    await executeCommand('terraform', ['destroy', '-auto-approve'], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 4: Destroy Foundation (only if no other cluster VMs exist in project)
    job.currentStep = 'Step 4: Checking Shared Foundation Footprint';
    let remainingInstances = '';
    try {
      remainingInstances = execSync(`gcloud compute instances list --project=${projectId} --format="value(name)" 2>/dev/null`, { encoding: 'utf-8' });
    } catch (e) {}

    const hasOtherNodes = remainingInstances.trim().length > 0;
    if (hasOtherNodes) {
      appendLog(job, 'info', `🛡️ Shared VPC Subnet protection: detected other active virtual machines in project "${projectId}". Skipping shared Foundation destruction so remaining clusters stay online.`, job.currentStep);
    } else {
      job.currentStep = 'Step 4: Destroying Foundation Layer';
      const tfFoundationDir = path.join(rootDir, 'terraform', 'foundation');
      appendLog(job, 'warn', 'Destroying foundation networking and service accounts...', job.currentStep);
      await executeCommand('terraform', [
        'init',
        '-reconfigure',
        `-backend-config=bucket=gem-${projectId}-tfstate`,
        '-backend-config=prefix=foundation/state',
        `-backend-config=impersonate_service_account=${saEmail}`
      ], tfFoundationDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
      await executeCommand('terraform', ['destroy', '-auto-approve'], tfFoundationDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    }

    job.status = 'success';
    job.currentStep = 'Teardown Completed Successfully';
    appendLog(job, 'success', `🎉 Virtual GDC Cluster "${clusterName}" and all associated infrastructure have been cleanly destroyed!`, 'Completed');
  } catch (error: any) {
    job.status = 'failed';
    job.currentStep = 'Failed during Teardown';
    appendLog(job, 'error', `Teardown Error: ${error.message}`, 'Failed');
    try {
      analyzeError(job.currentStep || 'Infrastructure Teardown', job.logs.map(l => l.message), projectId);
    } catch (e) {
      console.error('Watchdog analysis error:', e);
    }
    throw error;
  }
}

function executeCommand(
  cmd: string,
  args: string[],
  cwd: string,
  envVars: Record<string, string>,
  job: DeploymentJob
): Promise<void> {
  return new Promise((resolve, reject) => {
    appendLog(job, 'command', `$ ${cmd} ${args.join(' ')} (cwd: ${cwd})`);
    
    const env = { ...process.env, ...envVars };
    const child = spawn(cmd, args, { cwd, env, shell: true });
    job.process = child;

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) appendLog(job, 'info', line);
      });
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line: string) => {
        if (line.trim()) {
          // Determine if warn or error based on text
          const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal');
          appendLog(job, isError ? 'error' : 'warn', line);
        }
      });
    });

    child.on('close', (code) => {
      job.process = undefined;
      if (code === 0) {
        appendLog(job, 'success', `Command completed successfully with exit code 0`);
        resolve();
      } else {
        reject(new Error(`Command ${cmd} failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      job.process = undefined;
      reject(err);
    });
  });
}

export function killJob(jobId = 'default'): boolean {
  const job = getJob(jobId);
  let killed = false;
  if (job.process) {
    try {
      job.process.kill('SIGKILL');
      killed = true;
    } catch (e) {
      console.warn('Error killing child process:', e);
    }
  }
  try {
    const targetCluster = jobId.split('-').slice(1).join('-');
    execSync(`pkill -9 -f "${job.id}" || pkill -9 -f "${targetCluster}" || true`, { stdio: 'ignore' });
    killed = true;
  } catch {}

  job.status = 'failed';
  job.currentStep = 'Cancelled by User';
  job.process = undefined;
  appendLog(job, 'warn', '⏹ Automation job was forcibly stopped and cancelled by the user.', 'Cancelled');
  return killed;
}

