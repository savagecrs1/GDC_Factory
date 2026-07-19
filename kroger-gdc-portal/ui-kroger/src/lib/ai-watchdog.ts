import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { addAuditLog } from './k8s-client';

export interface TriageReport {
  id: string;
  timestamp: string;
  errorTitle: string;
  rootCause: string;
  remediationStep: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  failedStep: string;
  rawErrorSnippet: string;
  autoFixAvailable: boolean;
  autoFixCommand?: string;
  status: 'open' | 'remediated' | 'ignored';
}

const TRIAGE_FILE = path.join('/tmp', 'gdc_sentinel_triage.json');

export function getTriageReports(): TriageReport[] {
  try {
    if (fs.existsSync(TRIAGE_FILE)) {
      const data = fs.readFileSync(TRIAGE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading triage file:', err);
  }
  return [];
}

export function saveTriageReport(report: TriageReport): void {
  const reports = getTriageReports();
  reports.unshift(report); // Add to top
  // Keep last 50 reports
  const trimmed = reports.slice(0, 50);
  try {
    fs.writeFileSync(TRIAGE_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving triage report:', err);
  }
  addAuditLog('AI Triage Alert', report.errorTitle, `Watchdog detected error in ${report.failedStep}: ${report.rootCause.slice(0, 80)}...`, 'error');
}

export function updateTriageStatus(id: string, status: 'open' | 'remediated' | 'ignored'): boolean {
  const reports = getTriageReports();
  const index = reports.findIndex((r) => r.id === id);
  if (index !== -1) {
    reports[index].status = status;
    fs.writeFileSync(TRIAGE_FILE, JSON.stringify(reports, null, 2), 'utf-8');
    return true;
  }
  return false;
}

export function clearTriageReports(): void {
  try {
    if (fs.existsSync(TRIAGE_FILE)) fs.unlinkSync(TRIAGE_FILE);
  } catch (err) {
    console.error('Error clearing triage reports:', err);
  }
}

export function analyzeError(failedStep: string, rawLogs: string[], projectId: string): TriageReport {
  const errorText = rawLogs.slice(-25).join('\n');
  const timestamp = new Date().toISOString();
  const id = `triage-${Date.now()}`;

  let errorTitle = 'Unknown Deployment Exception';
  let rootCause = 'An unexpected failure occurred during automation execution.';
  let remediationStep = 'Review raw terminal logs and verify GCP IAM permissions.';
  let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  let autoFixAvailable = false;
  let autoFixCommand = '';

  // Rule 1: Shielded VM Secure Boot Constraint
  if (errorText.includes('requireShieldedVm') || errorText.includes('Secure Boot is not enabled')) {
    errorTitle = 'Organization Policy Violation (Shielded VM)';
    rootCause = `GCP Organization Policy 'constraints/compute.requireShieldedVm' blocked VM creation because Secure Boot signature verification is required by org rules.`;
    remediationStep = `Reset or disable 'constraints/compute.requireShieldedVm' on project ${projectId}, or set enable_secure_boot = true in Terraform.`;
    severity = 'high';
    autoFixAvailable = true;
    autoFixCommand = `gcloud org-policies reset constraints/compute.requireShieldedVm --project=${projectId} --quiet`;
  }
  // Rule 2: OS Login Constraint
  else if (errorText.includes('requireOsLogin')) {
    errorTitle = 'Organization Policy Violation (OS Login)';
    rootCause = `GCP Organization Policy 'constraints/compute.requireOsLogin' rejected instance creation because OS Login is enforced across project metadata.`;
    remediationStep = `Reset 'constraints/compute.requireOsLogin' on project ${projectId} to allow standard SSH key metadata injection.`;
    severity = 'high';
    autoFixAvailable = true;
    autoFixCommand = `gcloud org-policies reset constraints/compute.requireOsLogin --project=${projectId} --quiet`;
  }
  // Rule 3: IP Forwarding Constraint
  else if (errorText.includes('vmCanIpForward')) {
    errorTitle = 'Organization Policy Violation (IP Forwarding)';
    rootCause = `GCP Organization Policy 'constraints/compute.vmCanIpForward' prohibited enabling IP forwarding on network interfaces.`;
    remediationStep = `Reset 'constraints/compute.vmCanIpForward' on project ${projectId} to permit VXLAN overlay packet forwarding.`;
    severity = 'high';
    autoFixAvailable = true;
    autoFixCommand = `gcloud org-policies reset constraints/compute.vmCanIpForward --project=${projectId} --quiet`;
  }
  // Rule 4: Billing Account Disabled / Bucket Creation Failure
  else if (errorText.includes('billing account') || (errorText.includes('bucket') && errorText.includes('403'))) {
    errorTitle = 'GCP Billing Account Unlinked or Disabled';
    rootCause = `Google Cloud Storage bucket or compute resources failed to create because project '${projectId}' does not have an active billing account linked.`;
    remediationStep = `Link an open billing account using gcloud beta billing projects link, or select a valid Billing Account ID in the provisioning wizard.`;
    severity = 'critical';
    autoFixAvailable = true;
    autoFixCommand = `gcloud beta billing projects link ${projectId} --billing-account=$(gcloud billing accounts list --format="value(name)" --filter="open=true" | head -n 1 | awk -F/ '{print $2}')`;
  }
  // Rule 5: SSH Public Key / Permission Denied
  else if (errorText.includes('Permission denied (publickey)') || errorText.includes('UNREACHABLE')) {
    errorTitle = 'SSH Authentication Failure (Public Key Rejected)';
    rootCause = `Ansible failed to SSH into target host. Project '${projectId}' metadata lacks user SSH public keys or OS Login is blocking fallback auth.`;
    remediationStep = `Inject local SSH public key (${os.homedir()}/.ssh/google_compute_engine.pub or ~/.ssh/id_rsa.pub) into project metadata.`;
    severity = 'high';
    autoFixAvailable = true;
    autoFixCommand = `gcloud compute project-info add-metadata --project=${projectId} --metadata-from-file=ssh-keys=${os.homedir()}/.ssh/google_compute_engine.pub --quiet`;
  }
  // Rule 6: SA Key Creation Disabled
  else if (errorText.includes('disableServiceAccountKeyCreation')) {
    errorTitle = 'Service Account Key Creation Prohibited';
    rootCause = `Org policy 'constraints/iam.disableServiceAccountKeyCreation' prevented Ansible from exporting bm-gcr.json service account credentials.`;
    remediationStep = `Reset 'constraints/iam.disableServiceAccountKeyCreation' on target project.`;
    severity = 'high';
    autoFixAvailable = true;
    autoFixCommand = `gcloud org-policies reset constraints/iam.disableServiceAccountKeyCreation --project=${projectId} --quiet`;
  }
  // Rule 7: bmctl Preflight / VxLAN MTU
  else if (errorText.includes('preflight') || errorText.includes('MTU')) {
    errorTitle = 'Anthos bmctl Preflight Check Failure (Network MTU)';
    rootCause = `Anthos Bare Metal preflight validation detected network MTU or VXLAN overlay connectivity issues across cluster nodes.`;
    remediationStep = `Verify Docker daemon MTU is set to 1410 across workstation and cluster VMs to account for 50-byte GCE VXLAN encapsulation header overhead.`;
    severity = 'medium';
    autoFixAvailable = false;
  }
  // Fallback heuristic
  else {
    errorTitle = `Execution Failure in ${failedStep}`;
    rootCause = `The command process terminated with non-zero status. Review raw logs for syntax or configuration conflicts.`;
    remediationStep = `Examine terminal stack trace and verify network connectivity between central workstation and target project nodes.`;
    severity = 'medium';
  }

  const report: TriageReport = {
    id,
    timestamp,
    errorTitle,
    rootCause,
    remediationStep,
    severity,
    failedStep,
    rawErrorSnippet: errorText,
    autoFixAvailable,
    autoFixCommand,
    status: 'open',
  };

  saveTriageReport(report);
  return report;
}

export function executeAutoRemediate(id: string): { success: boolean; message: string; output?: string } {
  const reports = getTriageReports();
  const report = reports.find((r) => r.id === id);
  if (!report || !report.autoFixCommand) {
    return { success: false, message: 'No automated remediation command found for this triage report.' };
  }

  try {
    const output = execSync(report.autoFixCommand, { encoding: 'utf-8', timeout: 30000 });
    updateTriageStatus(id, 'remediated');
    addAuditLog('AI Auto-Remediation', report.errorTitle, `Successfully executed fix: ${report.autoFixCommand}`, 'success');
    return { success: true, message: `Auto-remediation executed successfully! You can now re-run the deployment step.`, output };
  } catch (err: any) {
    const errorMsg = err.stderr || err.message || 'Command failed';
    addAuditLog('AI Auto-Remediation Failed', report.errorTitle, `Fix command failed: ${errorMsg}`, 'error');
    return { success: false, message: `Auto-remediation command failed: ${errorMsg}` };
  }
}
