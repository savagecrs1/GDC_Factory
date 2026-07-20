'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, CheckCircle2, AlertCircle, RefreshCw, Server, Shield, ArrowRight, CornerDownRight, Radio, Trash2 } from 'lucide-react';
import ProjectSelector from '@/components/ProjectSelector';

interface ProvisionWizardProps {
  projectId: string;
  setProjectId: (id: string) => void;
  clusterName: string;
  setClusterName: (name: string) => void;
}

export default function ProvisionWizard({
  projectId,
  setProjectId,
  clusterName,
  setClusterName,
}: ProvisionWizardProps) {
  const [deployEdgeRouter, setDeployEdgeRouter] = useState(false);
  const [machineType, setMachineType] = useState('n2-standard-8');
  const [ipMode, setIpMode] = useState('internal');
  const [billingAccountId, setBillingAccountId] = useState('0150AE-F3AB84-9BC087');
  const [isDeploying, setIsDeploying] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const jobId = `${projectId}-${clusterName}`;

  useEffect(() => {
    // Automatically restore active process logs when switching between projects or tabs
    fetch(`/api/infrastructure/provision?jobId=${encodeURIComponent(jobId)}`)
      .then((res) => res.json())
      .then((job) => {
        if (job && (job.logs?.length > 0 || job.status === 'running')) {
          setLogs(job.logs || []);
          setCurrentStep(job.currentStep || 'Idle');
          setIsDeploying(job.status === 'running');
          if (job.status === 'running') {
            subscribeToLogs(jobId);
          }
        } else {
          setLogs([]);
          setCurrentStep('Idle');
          setIsDeploying(false);
        }
      })
      .catch((e) => console.warn('Could not restore job logs:', e));
  }, [projectId, clusterName]);

  const startDeployment = async () => {
    setIsDeploying(true);
    setError(null);
    setLogs([]);
    setCurrentStep('Initiating automation sequence...');

    try {
      const res = await fetch('/api/infrastructure/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, clusterName, deployEdgeRouter, machineType, ipMode, billingAccountId, jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start deployment');
      }
      // Start SSE stream
      subscribeToLogs(jobId);
    } catch (err: any) {
      setError(err.message);
      setIsDeploying(false);
    }
  };

  const startTeardown = async () => {
    if (!confirm(`⚠️ Are you sure you want to destroy the entire GDC cluster "${clusterName}" and its foundation in project "${projectId}"? This cannot be undone.`)) {
      return;
    }
    setIsDeploying(true);
    setError(null);
    setLogs([]);
    setCurrentStep('Initiating cluster destruction sequence...');

    try {
      const res = await fetch('/api/infrastructure/provision', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, clusterName, deployEdgeRouter, machineType, ipMode, jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start teardown');
      }
      subscribeToLogs(jobId);
    } catch (err: any) {
      setError(err.message);
      setIsDeploying(false);
    }
  };

  const cancelDeployment = async () => {
    if (!confirm('⚠️ Are you sure you want to force stop and kill the active automation job?')) return;
    try {
      await fetch('/api/infrastructure/provision', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      setIsDeploying(false);
      setCurrentStep('Cancelled by User');
    } catch (err: any) {
      console.error('Error cancelling job:', err);
    }
  };

  const subscribeToLogs = (id = jobId) => {
    const eventSource = new EventSource(`/api/infrastructure/logs?jobId=${encodeURIComponent(id)}`);

    eventSource.onmessage = (event) => {
      try {
        const logLine = JSON.parse(event.data);
        setLogs((prev) => {
          if (prev.some((l) => l.id === logLine.id)) return prev;
          return [...prev, logLine];
        });
        if (logLine.step) setCurrentStep(logLine.step);

        if (logLine.level === 'success' && logLine.message.includes('🎉')) {
          setIsDeploying(false);
          eventSource.close();
        }
        if (logLine.level === 'error' && logLine.step === 'Failed') {
          setIsDeploying(false);
          eventSource.close();
        }
      } catch (e) {
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsDeploying(false);
    };
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const steps = [
    'Step 1: Provisioning SA & State Bucket (project-setup.sh)',
    'Step 2: Deploying Shared Foundation (VPC, NAT, Admin Workstation)',
    'Step 3: Deploying Edge Router (VXLAN Ingress Proxy)',
    `Step 4: Provisioning Cluster VMs for ${clusterName}`,
    'Step 5: Configuring Foundation Environment (Ansible)',
    'Step 6: Orchestrating Anthos bmctl Deployment (Ansible)',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Cluster Provisioning Wizard</h2>
            <p className="text-xs text-slate-400">Orchestrate Terraform & Ansible playbooks</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Target GCP Project ID
            </label>
            <ProjectSelector projectId={projectId} setProjectId={setProjectId} disabled={isDeploying} />
            <p className="text-[10px] text-slate-500 mt-1">
              Impersonation SA: <span className="font-mono text-slate-400">tf-provisioner@{projectId || '...'}.iam.gserviceaccount.com</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>GCP Billing Account ID</span>
              <span className="text-[10px] text-slate-400 font-normal">For unlinked projects</span>
            </label>
            <input
              type="text"
              value={billingAccountId}
              onChange={(e) => setBillingAccountId(e.target.value)}
              disabled={isDeploying}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
              placeholder="e.g. 0150AE-F3AB84-9BC087"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              GDCSO Hybrid Cluster Name
            </label>
            <input
              type="text"
              value={clusterName}
              onChange={(e) => setClusterName(e.target.value)}
              disabled={isDeploying}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition"
              placeholder="e.g. gdc-hybrid-cluster-01"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Hardware Compute Footprint (Per Node)
            </label>
            <select
              value={machineType}
              onChange={(e) => setMachineType(e.target.value)}
              disabled={isDeploying}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition"
            >
              <option value="e2-standard-4">e2-standard-4 (4 vCPU, 16 GB RAM - Micro Sandbox)</option>
              <option value="e2-standard-8">e2-standard-8 (8 vCPU, 32 GB RAM - Compact Dev Lab)</option>
              <option value="n2-standard-8">n2-standard-8 (8 vCPU, 32 GB RAM - Standard Compact)</option>
              <option value="n2-standard-16">n2-standard-16 (16 vCPU, 64 GB RAM - 50% XR11 Dev Footprint)</option>
              <option value="n2-standard-32">n2-standard-32 (32 vCPU, 128 GB RAM - Dell XR11 GDC Medium Equivalent)</option>
              <option value="n2-standard-64">n2-standard-64 (64 vCPU, 256 GB RAM - Dell 8K / XR8000 GDC Medium Equivalent)</option>
              <option value="n2-highmem-32">n2-highmem-32 (32 vCPU, 256 GB RAM - Dell 8K High-Memory Equivalent)</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              💡 <span className="font-semibold text-slate-300">Dell XR11 Medium</span>: <code className="text-sky-300 font-mono">n2-standard-32</code> (32 vCPU, 128GB) | <span className="font-semibold text-slate-300">Dell 8K Medium</span>: <code className="text-sky-300 font-mono">n2-standard-64</code> (64 vCPU, 256GB)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Network Ingress & IP Addressing Mode
            </label>
            <select
              value={ipMode}
              onChange={(e) => setIpMode(e.target.value)}
              disabled={isDeploying}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition"
            >
              <option value="internal">Internal Only (RFC 1918 Private VPC + Cloud NAT - Secure)</option>
              <option value="external">External Public IPs on Nodes (Direct Internet Webhook Ingress)</option>
            </select>
          </div>

          <div className="pt-1">
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={deployEdgeRouter}
                onChange={(e) => setDeployEdgeRouter(e.target.checked)}
                disabled={isDeploying}
                className="mt-0.5 rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-0"
              />
              <div className="text-[11px]">
                <div className="font-semibold text-white">Deploy Optional Edge Router (VXLAN Ingress Proxy)</div>
                <div className="text-slate-400 mt-0.5 leading-snug">
                  Creates dedicated proxy (`e2-small`) on secondary VXLAN fabric for direct Traefik/SOCKS5 access.
                </div>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          <button
            onClick={startDeployment}
            disabled={isDeploying || !projectId || !clusterName}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition"
          >
            {isDeploying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Orchestrating Infrastructure...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Deploy Virtual GDC Environment</span>
              </>
            )}
          </button>

          {isDeploying && (
            <button
              onClick={cancelDeployment}
              className="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm animate-pulse"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>⏹ Force Stop / Cancel In-Process Automation Job</span>
            </button>
          )}

          <button
            onClick={startTeardown}
            disabled={isDeploying || !projectId || !clusterName}
            className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 disabled:opacity-50 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
          >
            {isDeploying ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Tearing Down...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Destroy / Tear Down Cluster Environment</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Architecture:</span>
            <span className="font-semibold text-slate-300">Two-Tier (Foundation + Ephemeral)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>State Storage:</span>
            <span className="font-semibold text-slate-300">GCS Bucket Remote Backend</span>
          </div>
        </div>
      </div>

      {/* Right: Live Terminal & Step Progress Console */}
      <div className="lg:col-span-2 glass-panel rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        {/* Terminal Header */}
        <div className="bg-slate-900/90 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-mono font-semibold text-slate-200">Automation Live Output</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">SSE Stream</span>
          </div>

          <div className="flex items-center gap-2">
            {isDeploying ? (
              <span className="flex items-center gap-1.5 text-xs text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full font-medium border border-sky-500/20">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                {currentStep}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Ready</span>
            )}
          </div>
        </div>

        {/* Terminal Body */}
        <div className="terminal-window flex-1 p-5 font-mono text-xs overflow-y-auto max-h-[500px] min-h-[400px] space-y-2">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-3">
              <Terminal className="w-12 h-12 text-slate-700" />
              <div className="text-center">
                <p className="font-semibold text-slate-400">Terminal console is waiting for input</p>
                <p className="text-[11px]">Click "Deploy Virtual GDC Environment" to start streaming Terraform & Ansible logs</p>
              </div>
            </div>
          ) : (
            logs.map((log) => {
              let color = 'text-slate-300';
              if (log.level === 'error') color = 'text-rose-400 font-semibold';
              if (log.level === 'warn') color = 'text-amber-400';
              if (log.level === 'success') color = 'text-emerald-400 font-bold';
              if (log.level === 'command') color = 'text-sky-400 font-bold bg-slate-900/50 py-1 px-2 rounded border-l-2 border-sky-500 my-1';

              return (
                <div key={log.id} className={`leading-relaxed break-all ${color}`}>
                  <span className="text-slate-600 mr-2">[{log.timestamp.split('T')[1]?.split('.')[0]}]</span>
                  {log.message}
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Steps Progress Footer */}
        <div className="bg-slate-900/60 p-4 border-t border-slate-800 grid grid-cols-2 md:grid-cols-3 gap-2">
          {steps.map((stepTitle, idx) => {
            const isCurrent = currentStep.includes(`Step ${idx + 1}`);
            const isDone = logs.some((l) => l.step?.includes(`Step ${idx + 1}`) && l.level === 'success');

            return (
              <div
                key={idx}
                className={`p-2 rounded-lg text-[11px] border flex items-center gap-2 ${
                  isCurrent
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                    : isDone
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                ) : isCurrent ? (
                  <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 text-sky-400 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
                )}
                <span className="truncate">{stepTitle.split('(')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
