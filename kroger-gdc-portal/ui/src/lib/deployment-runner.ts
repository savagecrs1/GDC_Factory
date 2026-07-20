import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { analyzeError } from './ai-watchdog';

const homeDir = process.env.HOME || process.env.USERPROFILE || '';
process.env.PATH = `${process.env.PATH || ''}:${homeDir}/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;

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
  params?: {
    projectId: string;
    clusterName: string;
    deployEdgeRouter: boolean;
    machineType: string;
    ipMode: string;
    billingAccountId: string;
    preDeployWorkloads: string[];
    secondaryNetworks?: any[];
  };
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
    const cleanJob = {
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      logs: job.logs,
      params: job.params
    };
    fs.writeFileSync(filePath, JSON.stringify(cleanJob, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not save job to disk:', e);
  }
}

export function getJob(jobId = 'default'): DeploymentJob {
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
    status: restoredJob.status || jobs[jobId]?.status || 'idle',
    currentStep: restoredJob.currentStep || jobs[jobId]?.currentStep || 'Ready',
    logs: restoredJob.logs || jobs[jobId]?.logs || [],
    listeners: jobs[jobId]?.listeners || [],
    process: jobs[jobId]?.process,
    params: restoredJob.params || jobs[jobId]?.params,
  };
  return jobs[jobId];
}

export function getAllJobs(): DeploymentJob[] {
  try {
    const files = fs.readdirSync('/tmp').filter(f => f.startsWith('gdc_job_') && f.endsWith('.json'));
    for (const file of files) {
      const jobId = file.replace('gdc_job_', '').replace('.json', '');
      getJob(jobId);
    }
  } catch (e) {
    console.warn('Could not read jobs directory:', e);
  }
  return Object.values(jobs).filter(j => j.id !== 'default' || j.status !== 'idle');
}

export function subscribeToJob(jobId = 'default', listener: (line: LogLine) => void) {
  const job = getJob(jobId);
  job.listeners.push(listener);
  return () => {
    job.listeners = job.listeners.filter((l) => l !== listener);
  };
}

export function appendLog(job: DeploymentJob, level: LogLine['level'], message: string, step?: string) {
  // Strip ANSI control codes, carriage returns, backspaces, and escaped \b chars
  let cleanMessage = message
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\\b|[\b\r]/g, '')
    .trim();

  if (!cleanMessage) return;

  // Deduplicate Anthos/bmctl readiness polling spam
  if (cleanMessage.includes('Requeueing') || cleanMessage.includes('Waiting for cluster to become ready')) {
    const lastLog = job.logs[job.logs.length - 1];
    if (lastLog && (lastLog.message.includes('Waiting for cluster to become ready') || lastLog.message.includes('Requeueing'))) {
      lastLog.timestamp = new Date().toISOString();
      lastLog.message = cleanMessage;
      job.listeners.forEach((listener) => listener(lastLog));
      saveJobToDisk(job);
      return;
    }
  }

  const line: LogLine = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    level,
    message: cleanMessage,
    step: step || job.currentStep,
  };
  job.logs.push(line);
  job.listeners.forEach((listener) => listener(line));
  saveJobToDisk(job);
}

function getInstanceZone(name: string, project: string): string | null {
  try {
    const out = execSync(`gcloud compute instances list --filter="name=${name}" --project=${project} --format="value(zone)" --quiet`, { encoding: 'utf-8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function resourceExistsInGcp(resourceType: 'instance' | 'bucket' | 'network', name: string, project: string): boolean {
  try {
    if (resourceType === 'instance') {
      const zone = getInstanceZone(name, project);
      return zone !== null;
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
  billingAccountId = '0150AE-F3AB84-9BC087',
  preDeployWorkloads: string[] = [],
  isResume: boolean = false,
  secondaryNetworks?: any[]
) {
  const job = getJob(jobId);
  job.status = 'running';
  
  let resumeFrom = 0;
  if (isResume) {
    const stepStr = job.currentStep || '';
    if (stepStr.includes('Step 1:')) resumeFrom = 1;
    else if (stepStr.includes('Step 2a:')) resumeFrom = 2;
    else if (stepStr.includes('Step 2b:')) resumeFrom = 3;
    else if (stepStr.includes('Step 2c:')) resumeFrom = 4;
    else if (stepStr.includes('Step 3:')) resumeFrom = 5;
    else if (stepStr.includes('Step 4:')) resumeFrom = 6;
    else if (stepStr.includes('Step 5:')) resumeFrom = 7;
    else if (stepStr.includes('Step 6:')) resumeFrom = 8;
    appendLog(job, 'info', `🔄 Resuming deployment sequence from: ${stepStr}`, 'Resuming');
  } else {
    job.logs = [];
    job.params = { projectId, clusterName, deployEdgeRouter, machineType, ipMode, billingAccountId, preDeployWorkloads, secondaryNetworks };
  }

  const rootDir = path.resolve(process.cwd(), '..');
  const saEmail = `tf-provisioner@${projectId}.iam.gserviceaccount.com`;

  try {
    // Step 1: Project Setup (IAM & API Enablement)
    if (resumeFrom <= 1) {
      job.currentStep = 'Step 1: GCP Project & IAM Setup (project-setup.sh)';
      appendLog(job, 'info', `Executing project-setup.sh for ${projectId} (Billing Account: ${billingAccountId})...`, job.currentStep);
      await executeCommand('./project-setup.sh', [projectId], rootDir, { PROJECT_ID: projectId, BILLING_ACCOUNT_ID: billingAccountId }, job);
    }

    // Step 2a: Foundation Layer
    if (resumeFrom <= 2) {
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
    }

    // Step 2b: Admin Workstation Layer
    if (resumeFrom <= 3) {
      job.currentStep = 'Step 2b: Checking Admin Workstation (terraform/admin-workstation)';
      const tfWsDir = path.join(rootDir, 'terraform', 'admin-workstation');
      if (resourceExistsInGcp('instance', 'gem-admin-ws', projectId)) {
        appendLog(job, 'info', `✅ Admin Workstation "gem-admin-ws" already exists in ${projectId}. Skipping creation!`, job.currentStep);
      } else {
        appendLog(job, 'info', 'Initializing Terraform for local admin workstation layer...', job.currentStep);
        await executeCommand('terraform', [
          'init',
          '-reconfigure',
          `-backend-config=bucket=gem-${projectId}-tfstate`,
          '-backend-config=prefix=admin-workstation/state',
          `-backend-config=impersonate_service_account=${saEmail}`
        ], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

        appendLog(job, 'info', 'Applying Terraform admin workstation layer...', job.currentStep);
        await executeCommand('terraform', ['apply', '-auto-approve', `-var=project_id=${projectId}`], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
      }
    }

    // Step 2c: Edge Router Layer (Optional)
    if (deployEdgeRouter && resumeFrom <= 4) {
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
      await executeCommand('terraform', ['apply', '-auto-approve', `-var=project_id=${projectId}`], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    }

    // Step 3: Cluster VMs Layer
    if (resumeFrom <= 5) {
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
        `-var=machine_type=${machineType}`,
        `-var=project_id=${projectId}`
      ], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
    }

    // Step 4: Ansible Workstation Preparation
    if (resumeFrom <= 6) {
      job.currentStep = 'Step 4: Configuring Workstation Software (ansible/admin-workstation.yaml)';
      appendLog(job, 'info', 'Running Ansible admin-workstation.yaml (installing Docker, Helm, bmctl)...', job.currentStep);
      const ansibleDir = path.join(rootDir, 'ansible');
      await executeCommand('ansible-playbook', ['admin-workstation.yaml'], ansibleDir, { GCP_PROJECT_ID: projectId, TARGET_CLUSTER_NAME: clusterName, ANSIBLE_SSH_ARGS: '-o ControlMaster=no' }, job);
    }

    // Step 5: Ansible bmctl Cluster Creation
    if (resumeFrom <= 7) {
      job.currentStep = `Step 5: Deploying Anthos Bare Metal Cluster via bmctl (create-cluster.yaml)`;
      appendLog(job, 'info', `Running Ansible create-cluster.yaml for ${clusterName}...`, job.currentStep);
      const ansibleDir = path.join(rootDir, 'ansible');
      
      const ansibleArgs = ['create-cluster.yaml', '-e', `tf_cluster_name=${clusterName}`];
      
      const activeSecNets = secondaryNetworks || job.params?.secondaryNetworks;
      if (activeSecNets && activeSecNets.length > 0) {
        const extraVarsFile = `/tmp/ansible_vars_${clusterName}.json`;
        try {
          fs.writeFileSync(extraVarsFile, JSON.stringify({ secondary_networks: activeSecNets }, null, 2), 'utf-8');
          ansibleArgs.push('-e', `@${extraVarsFile}`);
          appendLog(job, 'info', `Injecting customized secondary networks extra vars file: ${extraVarsFile}`, job.currentStep);
        } catch (e: any) {
          appendLog(job, 'warn', `Failed to write extra vars file: ${e.message}. Falling back to default inventory vars.`, job.currentStep);
        }
      }

      await executeCommand('ansible-playbook', ansibleArgs, ansibleDir, { GCP_PROJECT_ID: projectId, TARGET_CLUSTER_NAME: clusterName, ANSIBLE_SSH_ARGS: '-o ControlMaster=no' }, job);
    }

    // Step 6: Deploying Workloads (Optional)
    if (preDeployWorkloads && preDeployWorkloads.length > 0 && resumeFrom <= 8) {
      job.currentStep = 'Step 6: Deploying Workload Presets';
      appendLog(job, 'info', `Deploying workloads: ${preDeployWorkloads.join(', ')}...`, job.currentStep);
      for (const wlId of preDeployWorkloads) {
        appendLog(job, 'info', `Applying Kubernetes manifest for preset workload "${wlId}"...`, job.currentStep);
        
        let wlName = wlId;
        let image = 'nginx:alpine';
        let replicas = 3;
        let port = 80;

        if (wlId === 'kroger-pos-engine') {
          wlName = 'kroger-pos-engine';
          image = 'nginx:alpine';
          replicas = 3;
          port = 8080;
        } else if (wlId === 'aisle-spill-vision') {
          wlName = 'aisle-spill-vision';
          image = 'traefik/whoami';
          replicas = 2;
          port = 80;
        } else if (wlId === 'smart-cart-gateway') {
          wlName = 'smart-cart-gateway';
          image = 'nginxdemos/hello';
          replicas = 5;
          port = 80;
        } else if (wlId === 'clicklist-curbside') {
          wlName = 'clicklist-curbside';
          image = 'gcr.io/google-samples/microservices-demo/frontend:v0.8.0';
          replicas = 2;
          port = 8080;
        } else if (wlId === 'cooler-temp-monitor') {
          wlName = 'cooler-temp-monitor';
          image = 'redis:7.0-alpine';
          replicas = 1;
          port = 6379;
        } else if (wlId === 'edge-web') {
          wlName = 'edge-web';
          image = 'nginx:alpine';
          replicas = 3;
          port = 80;
        } else if (wlId === 'whoami-service') {
          wlName = 'whoami-service';
          image = 'traefik/whoami';
          replicas = 3;
          port = 80;
        } else if (wlId === 'hello-edge') {
          wlName = 'hello-edge';
          image = 'nginxdemos/hello';
          replicas = 2;
          port = 80;
        } else if (wlId === 'gcp-boutique') {
          wlName = 'gcp-boutique';
          image = 'gcr.io/google-samples/microservices-demo/frontend:v0.8.0';
          replicas = 2;
          port = 8080;
        } else if (wlId === 'edge-redis') {
          wlName = 'edge-redis';
          image = 'redis:7.0-alpine';
          replicas = 1;
          port = 6379;
        }

        const kubeconfig = `/home/gem/bmctl-workspace/${clusterName}/${clusterName}-kubeconfig`;
        const cmd = `sudo kubectl --kubeconfig=${kubeconfig} create deployment ${wlName} --image=${image} --replicas=${replicas} && sudo kubectl --kubeconfig=${kubeconfig} expose deployment ${wlName} --port=${port}`;
        
        const wsZone = getInstanceZone('gem-admin-ws', projectId) || 'us-central1-a';
        appendLog(job, 'info', `SSHing to gem-admin-ws (zone: ${wsZone}) to execute: ${cmd}`, job.currentStep);
        await executeCommand('gcloud', [
          'compute', 'ssh', 'gem-admin-ws',
          '--project', projectId,
          '--zone', wsZone,
          '--command', `"${cmd}"`
        ], rootDir, {}, job);
        
        appendLog(job, 'success', `✅ Workload "${wlName}" successfully pre-deployed!`, job.currentStep);
      }
    }
    job.status = 'success';
    job.currentStep = 'Completed Successfully';
    appendLog(job, 'success', `🎉 Virtual GDC Cluster "${clusterName}" deployed and registered successfully!`, 'Completed');
  } catch (error: any) {
    const failedStep = job.currentStep;
    job.status = 'failed';
    job.currentStep = failedStep;
    appendLog(job, 'error', `Deployment Error: ${error.message || error}`, failedStep);
    try {
      analyzeError(failedStep || 'Infrastructure Provisioning', job.logs.map(l => l.message), projectId);
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
  try {
    const deployFilePath = path.join('/tmp', `gdc_job_${jobId}_deploy.json`);
    fs.writeFileSync(deployFilePath, JSON.stringify({
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      logs: job.logs,
      params: job.params
    }, null, 2));
  } catch (e) {
    console.warn('Could not archive deployment logs:', e);
  }
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
    await executeCommand('terraform', ['destroy', '-auto-approve', `-var=cluster_name=${clusterName}`, `-var=machine_type=${machineType}`, `-var=project_id=${projectId}`], tfClusterDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

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
      await executeCommand('terraform', ['destroy', '-auto-approve', `-var=project_id=${projectId}`], tfEdgeDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
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
    await executeCommand('terraform', ['destroy', '-auto-approve', `-var=project_id=${projectId}`], tfWsDir, { PROVISIONING_SA_EMAIL: saEmail }, job);

    // Step 4: Destroy Foundation (only if no other cluster VMs exist in project)
    job.currentStep = 'Step 4: Checking Shared Foundation Footprint';
    let remainingInstances = '';
    try {
      remainingInstances = execSync(`gcloud compute instances list --project=${projectId} --format="value(name)" 2>/dev/null`, { encoding: 'utf-8' });
    } catch (e) {}

    const remainingVMs = remainingInstances.split('\n')
      .map(name => name.trim())
      .filter(name => name && name !== 'gem-admin-ws' && name !== 'gem-edge-router');
    const hasOtherNodes = remainingVMs.length > 0;
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
      await executeCommand('terraform', ['destroy', '-auto-approve', `-var=project_id=${projectId}`], tfFoundationDir, { PROVISIONING_SA_EMAIL: saEmail }, job);
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

    const cleanupProcess = () => {
      job.process = undefined;
      try {
        if (child.stdout) {
          child.stdout.removeAllListeners();
          child.stdout.destroy();
        }
        if (child.stderr) {
          child.stderr.removeAllListeners();
          child.stderr.destroy();
        }
        child.unref();
      } catch (e) {}
    };

    child.on('close', (code) => {
      cleanupProcess();
      if (code === 0) {
        appendLog(job, 'success', `Command completed successfully with exit code 0`);
        resolve();
      } else {
        reject(new Error(`Command ${cmd} failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      cleanupProcess();
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

