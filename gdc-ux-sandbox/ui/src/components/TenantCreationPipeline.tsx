'use client';

import React, { useState } from 'react';
import { 
  Globe, Server, Cpu, Network, Terminal, Layers, Shield, CheckCircle2, 
  AlertTriangle, ArrowRight, ArrowLeft, Zap, Play, RefreshCw, Box 
} from 'lucide-react';

interface PipelineProps {
  onComplete?: (newProject: any) => void;
  onCancel?: () => void;
}

export default function TenantCreationPipeline({ onComplete, onCancel }: PipelineProps) {
  const [step, setStep] = useState(1);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployStatus, setDeployStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  // Form State
  const [formData, setFormData] = useState({
    projectId: 'retail-edge-store-402',
    projectName: 'Store 402 (Chicago North) - Edge POS',
    region: 'us-central1',
    tenantType: 'retail-pos',
    machineSize: 'n2-standard-8',
    nodeCount: 3,
    storageType: 'topolvm-nvme',
    networkTopology: 'multi-vlan-vxlan',
    vlanTags: 'VLAN 100 (POS), VLAN 200 (Corp), VLAN 300 (IoT)',
    bgpEnabled: true,
    workloads: ['elera-pos-engine', 'redis-cache-cluster', 'config-sync-agent'],
    vms: ['win-pos-controller-01', 'rhel9-db-node'],
  });

  const handleWorkloadToggle = (id: string) => {
    setFormData(prev => ({
      ...prev,
      workloads: prev.workloads.includes(id)
        ? prev.workloads.filter(w => w !== id)
        : [...prev.workloads, id]
    }));
  };

  const handleVmToggle = (id: string) => {
    setFormData(prev => ({
      ...prev,
      vms: prev.vms.includes(id)
        ? prev.vms.filter(v => v !== id)
        : [...prev.vms, id]
    }));
  };

  const startFullStackDeployment = () => {
    setIsDeploying(true);
    setDeployStatus('running');
    setDeployLogs([
      `[INFO] Initializing Full-Stack Tenant Pipeline for project: ${formData.projectId}`,
      `[IAM] Creating GCP project resource and enabling Anthos Bare-Metal & Compute APIs...`,
    ]);

    setTimeout(() => {
      setDeployLogs(prev => [
        ...prev,
        `[SUCCESS] Project ${formData.projectId} active in ${formData.region}.`,
        `[NETWORKING] Configuring ${formData.networkTopology} overlay (${formData.vlanTags})...`,
        `[BGP] EVPN L2 broadcast domain isolation established across Top-of-Rack switches.`,
      ]);
    }, 2500);

    setTimeout(() => {
      setDeployLogs(prev => [
        ...prev,
        `[COMPUTE] Provisioning ${formData.nodeCount}x ${formData.machineSize} bare-metal servers...`,
        `[ANSIBLE] Executing bmctl create cluster --cluster-name=${formData.projectId}-cluster...`,
        `[TOPOLVM] Configuring NVMe local storage storage classes (RWO)...`,
      ]);
    }, 5500);

    setTimeout(() => {
      setDeployLogs(prev => [
        ...prev,
        `[SUCCESS] Bare-Metal K8s Cluster active! Control plane SLA 100%.`,
        `[BOOTSTRAP] Deploying selected K8s workloads: ${formData.workloads.join(', ')}...`,
        `[BOOTSTRAP] Provisioning KubeVirt OCI virtual machines: ${formData.vms.join(', ')}...`,
        `[SENTINEL] AI Watchdog attached. All telemetry streams piped to Fleet Operations Center.`,
      ]);
      setDeployStatus('success');
    }, 8500);
  };

  return (
    <div className="glass-panel p-8 rounded-3xl border-2 border-purple-500/50 shadow-2xl space-y-8 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950 max-w-5xl mx-auto">
      {/* Header & Step Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-purple-500/20 font-black">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Full-Stack Tenant & Cluster Creation Pipeline</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                End-to-End Orchestrator
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Create a new GCP project, size bare-metal hardware, configure specialized network overlays, provision clusters, and bootstrap workloads in one unified flow.
            </p>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold transition-all ${
                step === s
                  ? 'bg-purple-600 text-white border-2 border-purple-400 shadow-md shadow-purple-500/30 scale-110'
                  : step > s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-900 text-slate-600 border border-slate-800'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
          ))}
        </div>
      </div>

      {!isDeploying ? (
        <div className="space-y-6">
          {/* STEP 1: PROJECT & TENANT IDENTITY */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-sm font-extrabold text-purple-400 uppercase tracking-wider">
                <span>Phase 1: Tenant Project Identity & GCP Scope</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-2">
                  <label className="font-bold text-slate-300">GCP Project ID</label>
                  <input
                    type="text"
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 focus:outline-none text-white font-mono"
                  />
                  <p className="text-[11px] text-slate-500">Globally unique GCP project identifier. Must be lowercase alphanumeric with hyphens.</p>
                </div>

                <div className="space-y-2">
                  <label className="font-bold text-slate-300">Friendly Tenant Project Name</label>
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 focus:outline-none text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-bold text-slate-300">GCP Deployment Region</label>
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 focus:outline-none text-white font-mono"
                  >
                    <option value="us-central1">us-central1 (Iowa - Primary DC)</option>
                    <option value="us-east4">us-east4 (Northern Virginia)</option>
                    <option value="us-west1">us-west1 (Oregon)</option>
                    <option value="europe-west1">europe-west1 (Belgium)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="font-bold text-slate-300">Edge Tenant Template Archetype</label>
                  <select
                    value={formData.tenantType}
                    onChange={(e) => setFormData({ ...formData, tenantType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 focus:outline-none text-white"
                  >
                    <option value="retail-pos">🛒 Retail Grocery POS & High-Availability Store Edge</option>
                    <option value="manufacturing">🏭 Manufacturing AI & Real-Time Quality Computer Vision</option>
                    <option value="healthcare">🏥 Healthcare VDC & HIPAA Compliant Patient Data Core</option>
                    <option value="logistics">🚚 Supply Chain Logistics & Automated Warehouse Controller</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: HARDWARE SIZING & COMPUTE TOPOLOGY */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-sm font-extrabold text-sky-400 uppercase tracking-wider">
                <span>Phase 2: Bare-Metal Machine Sizing & Storage Architecture</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {[
                  { id: 'e2-standard-8', name: 'Small Retail Edge Node', specs: '8 vCPUs • 32 GB RAM', storage: '800 GB TopoLVM', desc: 'Optimized for remote grocery POS checkout lanes and microservices.' },
                  { id: 'n2-standard-8', name: 'Standard VDC Bare-Metal', specs: '8 vCPUs • 32 GB RAM', storage: '1.4 TB NVMe TopoLVM', desc: 'High-I/O enterprise database processing and KubeVirt Windows VMs.' },
                  { id: 'n2-standard-16', name: 'AI Enterprise GPU Core', specs: '16 vCPUs • 64 GB RAM', storage: '3.2 TB NVMe + NVIDIA L4', desc: 'Heavy computer vision inference, LLM caching, and real-time analytics.' },
                ].map((m) => {
                  const isSelected = formData.machineSize === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setFormData({ ...formData, machineSize: m.id })}
                      className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500 shadow-lg shadow-sky-500/10 font-bold'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white text-sm">{m.name}</span>
                          {isSelected && <span className="bg-sky-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded">SELECTED</span>}
                        </div>
                        <div className="font-mono text-sky-400 font-extrabold mt-1">{m.specs}</div>
                        <div className="font-mono text-purple-300 text-[11px] mt-0.5">💾 {m.storage}</div>
                        <p className="text-slate-400 text-[11px] font-normal mt-2 leading-relaxed">{m.desc}</p>
                      </div>
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Node Cluster Count:</span>
                        <span className="font-mono font-bold text-white bg-slate-900 px-2.5 py-1 rounded border border-slate-700">3 Nodes (HA)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: SPECIALIZED NETWORKING REQUIREMENTS */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-400 uppercase tracking-wider">
                <span>Phase 3: Specialized Network Requirements & L2 Overlays</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {[
                  { id: 'default-vlan', name: 'Standard Bridged VLAN', tags: 'VLAN 100 (Untagged)', desc: 'Single L2 broadcast domain for standard edge compute clusters.' },
                  { id: 'multi-vlan-vxlan', name: 'Multi-Tenant VXLAN Overlay', tags: 'VLAN 100 (POS), 200 (Corp), 300 (IoT)', desc: 'Isolated VXLAN tunnels separating PCI payment card data from general store WiFi and IoT networks.' },
                  { id: 'air-gapped-bgp', name: 'Zero-Trust Air-Gapped BGP', tags: 'BGP EVPN + Calico Network Policies', desc: 'Strict zero-trust microsegmentation with BGP EVPN routing tables for high-security manufacturing.' },
                ].map((net) => {
                  const isSelected = formData.networkTopology === net.id;
                  return (
                    <div
                      key={net.id}
                      onClick={() => setFormData({ ...formData, networkTopology: net.id, vlanTags: net.tags })}
                      className={`p-5 rounded-2xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500 shadow-lg shadow-emerald-500/10 font-bold'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white text-sm">{net.name}</span>
                          {isSelected && <span className="bg-emerald-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded">SELECTED</span>}
                        </div>
                        <div className="font-mono text-emerald-400 font-bold mt-1.5 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">{net.tags}</div>
                        <p className="text-slate-400 text-[11px] font-normal mt-2.5 leading-relaxed">{net.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: WORKLOAD & VM BOOTSTRAPPING ROSTER */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-sm font-extrabold text-pink-400 uppercase tracking-wider">
                <span>Phase 4: Workload & Virtual Machine Bootstrapping Roster</span>
              </div>
              <p className="text-xs text-slate-400">
                Select which Kubernetes container applications and KubeVirt OCI virtual machines should be automatically deployed and verified as soon as the bare-metal cluster boots.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* K8s Workloads */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="text-xs font-black text-sky-400 flex items-center gap-2 uppercase tracking-wider border-b border-slate-800 pb-2">
                    <Layers className="w-4 h-4" /> K8s Container Pods
                  </div>
                  {[
                    { id: 'elera-pos-engine', name: 'Elera Grocery POS Checkout Engine', desc: 'Toshiba high-throughput retail checkout microservice.' },
                    { id: 'redis-cache-cluster', name: 'In-Memory Redis Cache Cluster', desc: 'Sub-millisecond pricing lookup and session store.' },
                    { id: 'config-sync-agent', name: 'Anthos Config Sync Agent', desc: 'Automated GitOps repo synchronization and zero-trust drift correction.' },
                  ].map((w) => (
                    <label key={w.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={formData.workloads.includes(w.id)}
                        onChange={() => handleWorkloadToggle(w.id)}
                        className="mt-1 rounded text-purple-600 focus:ring-purple-500 bg-slate-950 border-slate-700 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">{w.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{w.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* KubeVirt VMs */}
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="text-xs font-black text-purple-400 flex items-center gap-2 uppercase tracking-wider border-b border-slate-800 pb-2">
                    <Cpu className="w-4 h-4" /> KubeVirt OCI Virtual Machines
                  </div>
                  {[
                    { id: 'win-pos-controller-01', name: 'Windows Server 2022 POS Controller', desc: 'Legacy Windows retail device management controller (OCI ContainerDisk).' },
                    { id: 'rhel9-db-node', name: 'RHEL 9 SQL Database Node', desc: 'Red Hat Enterprise Linux 9 instance with high-I/O TopoLVM storage.' },
                  ].map((vm) => (
                    <label key={vm.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={formData.vms.includes(vm.id)}
                        onChange={() => handleVmToggle(vm.id)}
                        className="mt-1 rounded text-purple-600 focus:ring-purple-500 bg-slate-950 border-slate-700 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">{vm.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{vm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW & EXECUTE PIPELINE */}
          {step === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-sm font-extrabold text-purple-400 uppercase tracking-wider">
                <span>Phase 5: Full-Stack Orchestration Review & Execute</span>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/20 via-slate-950 to-slate-950 border-2 border-purple-500/50 space-y-4">
                <h3 className="text-base font-black text-white">Project Deployment Manifest: <strong className="font-mono text-purple-300">{formData.projectId}</strong></h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono pt-2 border-t border-slate-800">
                  <div><span className="text-slate-400 block text-[10px]">REGION:</span><span className="text-white font-bold">{formData.region}</span></div>
                  <div><span className="text-slate-400 block text-[10px]">HARDWARE:</span><span className="text-sky-300 font-bold">3x {formData.machineSize}</span></div>
                  <div><span className="text-slate-400 block text-[10px]">NETWORKING:</span><span className="text-emerald-400 font-bold">{formData.networkTopology}</span></div>
                  <div><span className="text-slate-400 block text-[10px]">BOOTSTRAP:</span><span className="text-pink-400 font-bold">{formData.workloads.length + formData.vms.length} Apps/VMs</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Footer Button Bar */}
          <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center gap-2 border border-slate-700"
              >
                <ArrowLeft className="w-4 h-4" /> Previous Step
              </button>
            ) : (
              <button
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold transition border border-slate-800"
              >
                Cancel
              </button>
            )}

            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={startFullStackDeployment}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-black text-sm transition flex items-center gap-2 shadow-xl shadow-emerald-500/25 scale-105"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>🚀 Execute Full-Stack Tenant Pipeline</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* LIVE EXECUTION LOG TERMINAL & FLEET PIPING MONITOR */
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              <span className={`w-3.5 h-3.5 rounded-full ${
                deployStatus === 'running' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'
              }`} />
              <div>
                <div className="font-extrabold text-white text-sm">
                  {deployStatus === 'running' ? '⚙️ Orchestrating Tenant & Bare-Metal Infrastructure...' : '✨ Full-Stack Pipeline Completed Successfully!'}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {deployStatus === 'running' ? 'Piping real-time progress to Fleet Operations Center...' : 'Project active in Fleet matrix with 100% SLA.'}
                </div>
              </div>
            </div>
            {deployStatus === 'success' && (
              <button
                onClick={() => {
                  if (onComplete) onComplete(formData);
                }}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-md shadow-emerald-500/20"
              >
                Return to Fleet Operations →
              </button>
            )}
          </div>

          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/90 font-mono text-xs space-y-2 h-72 overflow-y-auto shadow-inner">
            {deployLogs.map((log, idx) => (
              <div key={idx} className={`leading-relaxed ${
                log.includes('[SUCCESS]') ? 'text-emerald-400 font-bold' : log.includes('[ERROR]') ? 'text-rose-400 font-bold' : 'text-slate-300'
              }`}>
                {log}
              </div>
            ))}
            {deployStatus === 'running' && (
              <div className="text-amber-400 animate-pulse font-bold mt-2">_ Awaiting next automation stage from Ansible engine...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
