'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Server, Cpu, Activity, RefreshCw, Layers, Terminal, ArrowUpRight, Zap, CheckCircle2, HardDrive, Shield, ExternalLink } from 'lucide-react';

interface FleetProps {
  currentProject: string;
  onSelectProject?: (proj: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export default function FleetOperationsCenter({ currentProject, onSelectProject, onNavigateTab }: FleetProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProj, setSelectedProj] = useState<string>(currentProject || 'gdc-edge-demo-1');
  const [fleetStats, setFleetStats] = useState<{
    totalClusters: number;
    totalVms: number;
    activeDeployments: number;
    healthyProjects: number;
  }>({ totalClusters: 0, totalVms: 0, activeDeployments: 0, healthyProjects: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/gcp/projects')
      .then((res) => res.json())
      .then((data) => {
        const projs = data.projects || ['gdc-edge-demo-1', 'core-edge-dm1', 'kroger-test-4', 'gdc-tenant-new-stage'];
        if (!projs.includes('gdc-tenant-new-stage')) projs.push('gdc-tenant-new-stage');
        setProjects(projs);
        setFleetStats({
          totalClusters: (projs.length - 1) * 2,
          totalVms: (projs.length - 1) * 4,
          activeDeployments: 1,
          healthyProjects: projs.length - 1,
        });
        if (projs.length > 0) {
          const firstId = typeof projs[0] === 'string' ? projs[0] : projs[0].projectId || projs[0].name;
          setSelectedProj(firstId || 'gdc-edge-demo-1');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        const fallback = ['gdc-edge-demo-1', 'core-edge-dm1', 'kroger-test-4', 'gdc-tenant-new-stage'];
        setProjects(fallback);
        setFleetStats({ totalClusters: 6, totalVms: 12, activeDeployments: 1, healthyProjects: 3 });
        setSelectedProj('gdc-edge-demo-1');
        setLoading(false);
      });
  }, []);

  // Mock deterministic metrics per project for rich visual inspection
  const getProjectTelemetry = (projId: string) => {
    const isNew = projId.includes('new') || projId.includes('stage') || projId.includes('onboard');
    const isPrimary = projId.includes('demo') || projId.includes('core');
    const vcpuPct = isNew ? 0 : isPrimary ? 75 : 42;
    const ramPct = isNew ? 0 : isPrimary ? 82 : 35;
    const storagePct = isNew ? 0 : isPrimary ? 64 : 28;
    return {
      isNew,
      status: isNew ? 'DAY-0: UNINITIALIZED' : 'RUNNING (100% SLA)',
      clusters: isNew ? 0 : isPrimary ? 2 : 1,
      nodes: isNew ? 'No Hardware Provisioned' : isPrimary ? '4x n2-standard-8' : '3x e2-standard-8',
      vcpuUsed: isNew ? 0 : isPrimary ? 24 : 10,
      vcpuTotal: isNew ? 0 : isPrimary ? 32 : 24,
      vcpuPct,
      ramUsed: isNew ? 0 : isPrimary ? 105 : 45,
      ramTotal: isNew ? 0 : isPrimary ? 128 : 128,
      ramPct,
      storageUsed: isNew ? 0 : isPrimary ? 1.4 : 0.6,
      storageTotal: isNew ? 0 : 2.0,
      storagePct,
      vms: isNew ? 0 : isPrimary ? 6 : 2,
      pods: isNew ? 0 : isPrimary ? 42 : 18,
      vlans: isNew ? 'VLAN Overlay Unassigned' : isPrimary ? 'VLAN 100, 200 (VXLAN Active)' : 'VLAN 3130 (Standard)',
    };
  };

  const activeTelemetry = getProjectTelemetry(selectedProj);

  return (
    <div className="glass-panel p-6 rounded-2xl border-2 border-purple-500/40 shadow-2xl space-y-6 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
            <Globe className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white tracking-tight">🌐 Multi-Cluster Fleet Control Center</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Lifecycle-Guided UX
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a tenant project below to inspect operational health or trigger Day-0 onboarding wizards for new deployments.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedProj('gdc-tenant-new-stage')}
            className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30 font-bold transition shadow-sm"
            title="Simulate adding a new uninitialized tenant project"
          >
            <span>+ Onboard New Tenant</span>
          </button>
          <button
            onClick={() => setLoading(!loading)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
            title="Refresh Fleet Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Interactive Master-Detail Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Project Roster (Master List - 4 Cols) */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider px-1 flex items-center justify-between">
            <span>Monitored Project Roster ({projects.length})</span>
            <span className="text-[10px] text-purple-400">Click to Inspect ↓</span>
          </div>
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
            {projects.map((projObj: any, idx) => {
              const projId = typeof projObj === 'string' ? projObj : projObj.projectId || projObj.name || String(projObj);
              const projName = typeof projObj === 'string' ? projObj : projObj.name || projObj.projectId || String(projObj);
              const isSelected = projId === selectedProj;
              const telem = getProjectTelemetry(projId);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedProj(projId);
                    if (onSelectProject) onSelectProject(projId);
                  }}
                  className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-600/25 to-indigo-600/20 border-purple-500 shadow-md shadow-purple-500/10'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      telem.isNew ? 'bg-amber-400 animate-bounce' : isSelected ? 'bg-purple-400 animate-pulse' : 'bg-emerald-500'
                    }`} />
                    <div className="min-w-0">
                      <div className={`font-bold text-xs font-mono truncate ${isSelected ? 'text-white font-extrabold' : 'text-slate-200'}`}>
                        {projId}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{projName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      telem.isNew
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : isSelected
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {telem.isNew ? 'DAY-0' : `${telem.clusters} CLUSTERS`}
                    </span>
                    <ArrowUpRight className={`w-4 h-4 ${isSelected ? 'text-purple-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Deep Visual Telemetry Inspector (Detail View - 8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 space-y-6 flex flex-col justify-between shadow-xl">
          {activeTelemetry.isNew ? (
            <div className="space-y-6 my-auto py-4">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-slate-900 border-2 border-amber-500/40 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 text-2xl">
                  🚀
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-amber-500 text-slate-950 px-2 py-0.5 rounded uppercase">Day-0 Onboarding Mode</span>
                    <h3 className="text-lg font-black text-white font-mono">{selectedProj}</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    This tenant project is uninitialized and contains no active bare-metal GDC clusters. To deploy workloads or virtual machines, you must first provision the underlying cluster infrastructure.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Required Onboarding Sequence:</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-300">
                      <span>1. API & Identity Setup</span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">Step 1</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Enable compute, container, and anthos APIs in GCP IAM.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-300">
                      <span>2. Network Overlay</span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">Step 2</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Assign L2 VLAN tags (100, 200) and BGP routing tables.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-300">
                      <span>3. IaC Provisioner</span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">Step 3</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Execute automated Ansible bare-metal deployment.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div className="text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    Ready to initialize {selectedProj}?
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">The automated deployment wizard takes ~15 minutes to complete.</div>
                </div>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('provision')}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <Terminal className="w-4 h-4" />
                  <span>🚀 Launch Cluster Provisioning Wizard</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
                  <div>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Active Inspection Target</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h3 className="text-xl font-black text-white font-mono">{selectedProj}</h3>
                      <span className="bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {activeTelemetry.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400 font-mono">
                    <div>Architecture: <strong className="text-white">{activeTelemetry.nodes}</strong></div>
                    <div>Network Overlay: <strong className="text-sky-300">{activeTelemetry.vlans}</strong></div>
                  </div>
                </div>

                {/* Visual Utilization Pie & Progress Gauges */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  {/* vCPU Gauge */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-sky-400" />
                        <span>vCPU Allocation</span>
                      </span>
                      <span className="font-mono text-sky-400 font-extrabold">{activeTelemetry.vcpuPct}%</span>
                    </div>
                    <div className="my-3 flex items-center justify-center">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8" className="text-slate-800 fill-none" />
                          <circle
                            cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8"
                            strokeDasharray={201}
                            strokeDashoffset={201 - (201 * activeTelemetry.vcpuPct) / 100}
                            className="text-sky-500 fill-none transition-all duration-700"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute font-mono font-bold text-xs text-white">{activeTelemetry.vcpuUsed}/{activeTelemetry.vcpuTotal}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-center text-slate-400">Intel Ice Lake Bare-Metal Nodes</div>
                  </div>

                  {/* RAM Gauge */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span>RAM In-Use</span>
                      </span>
                      <span className="font-mono text-purple-400 font-extrabold">{activeTelemetry.ramPct}%</span>
                    </div>
                    <div className="my-3 flex items-center justify-center">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8" className="text-slate-800 fill-none" />
                          <circle
                            cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8"
                            strokeDasharray={201}
                            strokeDashoffset={201 - (201 * activeTelemetry.ramPct) / 100}
                            className="text-purple-500 fill-none transition-all duration-700"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute font-mono font-bold text-xs text-white">{activeTelemetry.ramUsed}/{activeTelemetry.ramTotal}GB</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-center text-slate-400">ECC Registered Memory</div>
                  </div>

                  {/* Storage Gauge */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-pink-400" />
                        <span>TopoLVM Storage</span>
                      </span>
                      <span className="font-mono text-pink-400 font-extrabold">{activeTelemetry.storagePct}%</span>
                    </div>
                    <div className="my-3 flex items-center justify-center">
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8" className="text-slate-800 fill-none" />
                          <circle
                            cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="8"
                            strokeDasharray={201}
                            strokeDashoffset={201 - (201 * activeTelemetry.storagePct) / 100}
                            className="text-pink-500 fill-none transition-all duration-700"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute font-mono font-bold text-xs text-white">{activeTelemetry.storageUsed}TB</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-center text-slate-400">NVMe RWO Local Volumes</div>
                  </div>
                </div>

                {/* Workload Breakdown Pill Row */}
                <div className="grid grid-cols-3 gap-3 pt-4">
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Active VMs:</span>
                    <span className="font-mono font-bold text-white text-sm bg-purple-500/20 px-2 py-0.5 rounded text-purple-300 border border-purple-500/30">
                      {activeTelemetry.vms} running
                    </span>
                  </div>
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">K8s Pods:</span>
                    <span className="font-mono font-bold text-white text-sm bg-sky-500/20 px-2 py-0.5 rounded text-sky-300 border border-sky-500/30">
                      {activeTelemetry.pods} pods
                    </span>
                  </div>
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">GitOps Profile:</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" /> Synchronized
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Launch Console Action Bar */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-400">⚡ Jump directly to tools for <strong className="text-white font-mono">{selectedProj}</strong>:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigateTab && onNavigateTab('provision')}
                    className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition flex items-center gap-1.5 shadow-md shadow-sky-500/20"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Open Provisioner</span>
                  </button>
                  <button
                    onClick={() => onNavigateTab && onNavigateTab('vms')}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-md shadow-purple-500/20"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>VM Runtime</span>
                  </button>
                  <button
                    onClick={() => onNavigateTab && onNavigateTab('workloads')}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center gap-1.5 border border-slate-700"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Workloads</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
