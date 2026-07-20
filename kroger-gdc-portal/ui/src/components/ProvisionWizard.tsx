'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, CheckCircle2, AlertCircle, RefreshCw, Server, Shield, ArrowRight, CornerDownRight, Radio, Trash2 } from 'lucide-react';
import ProjectSelector from '@/components/ProjectSelector';

interface ProvisionWizardProps {
  projectId: string;
  setProjectId: (id: string) => void;
  clusterName: string;
  setClusterName: (name: string) => void;
  setActiveTab?: (tab: string) => void;
}

export default function ProvisionWizard({
  projectId,
  setProjectId,
  clusterName,
  setClusterName,
  setActiveTab,
}: ProvisionWizardProps) {
  const [deployEdgeRouter, setDeployEdgeRouter] = useState(false);
  const [machineType, setMachineType] = useState('n2-standard-8');
  const [ipMode, setIpMode] = useState('internal');
  const [billingAccountId, setBillingAccountId] = useState('0150AE-F3AB84-9BC087');
  const [selectedWorkloads, setSelectedWorkloads] = useState<string[]>([]);
  const [secondaryNetworks, setSecondaryNetworks] = useState<any[]>([
    {
      name: "vlan-123",
      vlan_id: 123,
      subnet: "172.16.10.0/24",
      gateway: "172.16.10.1",
      vip_pool: "172.16.10.200-172.16.10.250",
      pod_cidr: "172.16.100.0/16",
      per_node_ipam_size: 18,
    }
  ]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const [triageReport, setTriageReport] = useState<any | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixSuccess, setFixSuccess] = useState<string | null>(null);

  const jobId = `${projectId}-${clusterName}`;

  useEffect(() => {
    const savedJobId = localStorage.getItem('active_provision_job_id');
    if (savedJobId) {
      localStorage.removeItem('active_provision_job_id');
      fetch(`/api/infrastructure/provision?jobId=${encodeURIComponent(savedJobId)}`)
        .then(res => res.json())
        .then(job => {
          if (job && job.params) {
            if (job.params.projectId && job.params.projectId !== projectId) {
              setProjectId(job.params.projectId);
            }
            if (job.params.clusterName && job.params.clusterName !== clusterName) {
              setClusterName(job.params.clusterName);
            }
          }
        })
        .catch(console.error);
    }
  }, []);

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

  // Load triage reports on failure
  useEffect(() => {
    if (currentStep === 'Failed') {
      fetch(`/api/sentinel/triage?projectId=${encodeURIComponent(projectId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.reports && data.reports.length > 0) {
            const openReport = data.reports.find((r: any) => r.status === 'open');
            if (openReport) {
              setTriageReport(openReport);
            }
          }
        })
        .catch((e) => console.warn('Could not fetch triage reports:', e));
    } else {
      setTriageReport(null);
      setFixSuccess(null);
    }
  }, [currentStep, projectId]);

  const runAutoFix = async () => {
    if (!triageReport) return;
    setFixing(true);
    setFixSuccess(null);
    setError(null);
    try {
      const res = await fetch('/api/sentinel/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remediate', id: triageReport.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-fix command failed');
      setFixSuccess(data.message || 'Auto-fix applied successfully!');
      setTriageReport({ ...triageReport, status: 'remediated' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFixing(false);
    }
  };

  const resumeDeployment = async () => {
    setIsDeploying(true);
    setError(null);
    setFixSuccess(null);
    setTriageReport(null);
    try {
      const res = await fetch('/api/infrastructure/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resume deployment');
      subscribeToLogs(jobId);
    } catch (e: any) {
      setError(e.message);
      setIsDeploying(false);
    }
  };

  const startDeployment = async () => {
    setIsDeploying(true);
    setError(null);
    setLogs([]);
    setCurrentStep('Initiating automation sequence...');

    try {
      const res = await fetch('/api/infrastructure/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, clusterName, deployEdgeRouter, machineType, ipMode, billingAccountId, jobId, preDeployWorkloads: selectedWorkloads, secondaryNetworks }),
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
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const steps = [
    'Step 1: GCP Project & IAM Setup (project-setup.sh)',
    'Step 2a: Deploying Foundation (terraform/foundation)',
    'Step 2b: Checking Admin Workstation (terraform/admin-workstation)',
    'Step 2c: Deploying Edge Router (terraform/edge-router)',
    `Step 3: Provisioning Cluster VMs (${clusterName})`,
    'Step 4: Configuring Workstation Software (Ansible)',
    'Step 5: Deploying Anthos bmctl Cluster (Ansible)',
    'Step 6: Deploying Workload Presets',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg">Cluster Provisioning Wizard</h2>
              <p className="text-xs text-slate-400">Orchestrate Terraform & Ansible playbooks</p>
            </div>
          </div>
          {setActiveTab && (
            <button
              onClick={() => setActiveTab('fleet')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 text-[11px] font-semibold text-slate-450 hover:text-white hover:bg-slate-850/50 transition"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Return to Fleet Hub</span>
            </button>
          )}
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

          {/* Secondary Networks Customizer */}
          <div className="border-t border-slate-800 pt-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider">
                🌐 Store VLAN Networks & IPAM
              </label>
              <button
                type="button"
                disabled={isDeploying}
                onClick={() => {
                  const nextVlan = secondaryNetworks.length > 0 
                    ? Math.max(...secondaryNetworks.map(n => n.vlan_id)) + 1 
                    : 100;
                  const nextOctet = 10 + secondaryNetworks.length;
                  setSecondaryNetworks([
                    ...secondaryNetworks,
                    {
                      name: `vlan-${nextVlan}`,
                      vlan_id: nextVlan,
                      subnet: `172.16.${nextOctet}.0/24`,
                      gateway: `172.16.${nextOctet}.1`,
                      vip_pool: `172.16.${nextOctet}.200-172.16.${nextOctet}.250`,
                      pod_cidr: `172.16.${nextOctet + 100}.0/16`,
                      per_node_ipam_size: 18,
                    }
                  ]);
                }}
                className="text-[10px] text-sky-405 hover:text-sky-300 font-extrabold flex items-center gap-0.5 disabled:opacity-55"
              >
                + Add VLAN
              </button>
            </div>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {secondaryNetworks.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic p-3 text-center bg-slate-950/40 rounded-xl border border-slate-900">
                  No secondary VLANs defined. Default configs will be used.
                </div>
              ) : (
                secondaryNetworks.map((net, index) => (
                  <div key={index} className="p-3 rounded-xl bg-slate-950/80 border border-slate-850 space-y-2 text-[10px] relative">
                    <button
                      type="button"
                      disabled={isDeploying}
                      onClick={() => setSecondaryNetworks(secondaryNetworks.filter((_, idx) => idx !== index))}
                      className="absolute top-2 right-2 text-slate-500 hover:text-rose-450 disabled:opacity-50"
                      title="Remove Network"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-505 block">VLAN Name</span>
                        <input
                          type="text"
                          value={net.name}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].name = e.target.value;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-slate-505 block">VLAN ID</span>
                        <input
                          type="number"
                          value={net.vlan_id}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].vlan_id = parseInt(e.target.value) || 0;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-505 block">Subnet CIDR</span>
                        <input
                          type="text"
                          value={net.subnet}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].subnet = e.target.value;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-slate-550 block">Gateway</span>
                        <input
                          type="text"
                          value={net.gateway}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].gateway = e.target.value;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-550 block">VIP Range (MetalLB)</span>
                        <input
                          type="text"
                          value={net.vip_pool}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].vip_pool = e.target.value;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-slate-550 block">Pod CIDR</span>
                        <input
                          type="text"
                          value={net.pod_cidr}
                          disabled={isDeploying}
                          onChange={(e) => {
                            const updated = [...secondaryNetworks];
                            updated[index].pod_cidr = e.target.value;
                            setSecondaryNetworks(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 mt-0.5 text-white text-[10px] focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3.5 space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              📦 Pre-deploys & Kroger Workload Presets
            </label>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {[
                { id: 'kroger-pos-engine', name: 'kroger-pos-engine', desc: 'Deploy 3 replicas of the store point-of-sale checkout engine.', type: 'Store POS' },
                { id: 'aisle-spill-vision', name: 'aisle-spill-vision', desc: 'Deploy 2 replicas of the real-time camera spill detection proxy.', type: 'Computer Vision' },
                { id: 'smart-cart-gateway', name: 'smart-cart-gateway', desc: 'Deploy 5 replicas of the WiFi mesh smart cart telemetry gateway.', type: 'IoT Smart Cart' },
                { id: 'clicklist-curbside', name: 'clicklist-curbside', desc: 'Deploy 2 replicas of the pickup order fulfillment dispatcher.', type: 'ClickList Pickup' },
                { id: 'cooler-temp-monitor', name: 'cooler-temp-monitor', desc: 'Deploy a single-node Redis store for cooler sensor telemetry.', type: 'IoT Cooler' }
              ].map(wl => {
                const isChecked = selectedWorkloads.includes(wl.id);
                return (
                  <label key={wl.id} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-850 cursor-pointer hover:border-slate-800 transition">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDeploying}
                      onChange={() => {
                        if (isChecked) {
                          setSelectedWorkloads(selectedWorkloads.filter(w => w !== wl.id));
                        } else {
                          setSelectedWorkloads([...selectedWorkloads, wl.id]);
                        }
                      }}
                      className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-550 focus:ring-0"
                    />
                    <div className="text-[10px] leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">{wl.name}</span>
                        <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-900 font-mono text-[8px] font-bold">{wl.type}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{wl.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
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
      <div className="lg:col-span-2 space-y-6 flex flex-col">
        {/* Sentinel Diagnostic Alert Card */}
        {triageReport && (
          <div className="glass-panel p-5 rounded-2xl border border-rose-500/30 bg-rose-950/20 shadow-lg shadow-rose-950/20 animate-fade-in space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-rose-300 text-sm">{triageReport.errorTitle}</h3>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 font-semibold px-2 py-0.5 rounded-full uppercase border border-rose-500/30">
                    {triageReport.severity} Severity
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-medium leading-relaxed">
                  <span className="text-slate-400 font-semibold">Root Cause:</span> {triageReport.rootCause}
                </p>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  <span className="text-emerald-400 font-semibold">💡 Remediation Step:</span> {triageReport.remediationStep}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-rose-500/20">
              <div className="text-[10px] text-slate-400 font-mono">
                Failed at: <span className="text-slate-300">{triageReport.failedStep}</span>
              </div>
              <div className="flex items-center gap-3">
                {triageReport.autoFixAvailable && triageReport.status === 'open' && (
                  <button
                    onClick={runAutoFix}
                    disabled={fixing}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {fixing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying Fix...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Auto-Fix with Sentinel</span>
                      </>
                    )}
                  </button>
                )}

                {triageReport.status === 'remediated' && (
                  <span className="text-xs text-emerald-450 font-semibold flex items-center gap-1">
                    ✅ Fix Applied Successfully
                  </span>
                )}

                <button
                  onClick={resumeDeployment}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resume Build</span>
                </button>
              </div>
            </div>
            {fixSuccess && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] rounded-lg font-mono leading-normal">
                {fixSuccess}
              </div>
            )}
          </div>
        )}

        <div className="glass-panel rounded-2xl border border-slate-800 flex flex-col overflow-hidden flex-1">
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
                <div className="flex items-center gap-2">
                  {logs.some(l => l.level === 'error') && (
                    <button
                      onClick={resumeDeployment}
                      className="flex items-center gap-1 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm transition animate-pulse"
                      title="Resume build from current step"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Resume Build</span>
                    </button>
                  )}
                  <span className="text-xs text-slate-400">Ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Body */}
          <div ref={logsContainerRef} className="terminal-window flex-1 p-5 font-mono text-xs overflow-y-auto max-h-[500px] min-h-[400px] space-y-2">
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
          </div>

          {/* Top Progress Line */}
          {isDeploying && (
            <div className="w-full bg-slate-950 h-1 overflow-hidden">
              <div
                className="bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 h-full transition-all duration-500"
                style={{
                  width: `${Math.max(10, Math.min(100, (steps.findIndex(s => s.startsWith(currentStep.split(':')[0])) + 1) * (100 / steps.length)))}%`,
                }}
              />
            </div>
          )}

          {/* Steps Progress Footer */}
          <div className="bg-slate-900/60 p-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span>⏱️ Orchestration Progress</span>
                {isDeploying && <span className="text-sky-400 bg-sky-950 border border-sky-800 px-2 py-0.5 rounded-full text-[10px]">Est. ~12m total</span>}
              </span>
              <span>
                {steps.filter(s => logs.some(l => l.step?.startsWith(s.split(':')[0]) && l.level === 'success')).length} of {steps.length} Steps Complete
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {steps.map((stepTitle, idx) => {
                const stepPrefix = stepTitle.split(':')[0]; // e.g. "Step 1", "Step 2a"
                const isCurrent = currentStep.startsWith(stepPrefix);
                const isDone = logs.some((l) => l.step?.startsWith(stepPrefix) && l.level === 'success');

                const durations: { [k: string]: string } = {
                  'Step 1': '~15s',
                  'Step 2a': '~45s',
                  'Step 2b': '~30s',
                  'Step 2c': '~30s',
                  'Step 3': '~3m',
                  'Step 4': '~2m',
                  'Step 5': '~5-7m',
                  'Step 6': '~1m',
                };

                return (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg text-[11px] border flex items-center justify-between gap-1.5 ${
                      isCurrent
                        ? 'bg-sky-500/10 border-sky-500/40 text-sky-300 animate-pulse'
                        : isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                      ) : isCurrent ? (
                        <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 text-sky-400 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
                      )}
                      <span className="truncate">{stepTitle.split('(')[0].split(':')[1]?.trim() || stepTitle}</span>
                    </div>
                    <span className="text-[9px] font-mono opacity-60 shrink-0">{durations[stepPrefix] || '~1m'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
