'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Server, Cpu, Activity, RefreshCw, Layers, Terminal, ArrowUpRight, Zap, CheckCircle2, HardDrive, Shield, ExternalLink, Network, Bot } from 'lucide-react';

interface FleetProps {
  currentProject: string;
  onSelectProject?: (proj: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export default function FleetOperationsCenter({ currentProject, onSelectProject, onNavigateTab }: FleetProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProj, setSelectedProj] = useState<string>(currentProject || 'gdc-edge-demo-1');
  const [inspectedCluster, setInspectedCluster] = useState<string | null>(null);
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
            onClick={() => {
              setSelectedProj('gdc-tenant-new-stage');
              if (onNavigateTab) onNavigateTab('create-tenant');
            }}
            className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 rounded-xl border border-amber-500/40 font-extrabold transition shadow-md shadow-amber-500/10 scale-105"
            title="Launch 5-Phase Full-Stack Tenant & Cluster Creation Pipeline"
          >
            <span>⚡ + Onboard Tenant Pipeline</span>
          </button>
          <button
            onClick={() => setLoading(!loading)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
            title="Refresh Fleet Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
      </div>

      {/* 3-State Modal Window Machine: Fleet Matrix -> Project Console -> Cluster Console */}
      {activeModalView === 'fleet' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">🏢 Tenant Project Matrix ({projects.length})</h3>
              <p className="text-xs text-slate-400 mt-0.5">Select a button next to any project to open its dedicated Project Console window.</p>
            </div>
            <button
              onClick={() => {
                setSelectedProj('gdc-tenant-new-stage');
                if (onNavigateTab) onNavigateTab('create-tenant');
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>+ Create New Project & Sizing Pipeline</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((projObj: any, idx) => {
              const projId = typeof projObj === 'string' ? projObj : projObj.projectId || projObj.name || String(projObj);
              const projName = typeof projObj === 'string' ? projObj : projObj.name || projObj.projectId || String(projObj);
              const telem = getProjectTelemetry(projId);
              return (
                <div key={idx} className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/60 transition shadow-xl flex flex-col justify-between space-y-5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${telem.isNew ? 'bg-amber-400 animate-bounce' : 'bg-emerald-400 animate-pulse'}`} />
                          <h4 className="text-lg font-black text-white font-mono">{projId}</h4>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{projName}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${telem.isNew ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'}`}>
                        {telem.isNew ? 'DAY-0' : `${telem.clusters} CLUSTERS`}
                      </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/60"><span className="text-slate-500 block text-[9px]">HARDWARE</span><span className="text-slate-200 font-bold">{telem.nodes}</span></div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800/60"><span className="text-slate-500 block text-[9px]">OVERLAY</span><span className="text-sky-300 font-bold truncate block">{telem.vlans}</span></div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedProj(projId);
                      if (onSelectProject) onSelectProject(projId);
                      setActiveModalView('project');
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs transition shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 group/btn"
                  >
                    <span>🗂️ Open Project Console</span>
                    <ArrowUpRight className="w-4 h-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STATE 2: Project Console Window */}
      {activeModalView === 'project' && (
        <div className="space-y-6 animate-fadeIn bg-slate-900/90 border-2 border-purple-500/50 rounded-3xl p-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModalView('fleet')}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                >
                  ⬅️ Return to Fleet Matrix
                </button>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Active Project Console</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h3 className="text-2xl font-black text-white font-mono">{selectedProj}</h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {activeTelemetry.status}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                if (onNavigateTab) onNavigateTab('provision');
              }}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition shadow-lg shadow-sky-500/20 flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              <span>+ Deploy Another Cluster to Project</span>
            </button>
          </div>

          {activeTelemetry.isNew ? (
            <div className="p-8 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-900 border-2 border-amber-500/40 space-y-6 text-center max-w-2xl mx-auto my-8 shadow-2xl">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto text-3xl shadow-lg shadow-amber-500/10">
                🚀
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black text-white">Day-0 Onboarding Mode: {selectedProj}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This tenant project is uninitialized and contains no active bare-metal GDC clusters. To deploy workloads or virtual machines, you must first progress through the cluster sizing and provisioning walkthrough.
                </p>
              </div>
              <button
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('create-tenant');
                }}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm transition shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <span>🚀 Launch Sizing & Cluster Provisioning Walkthrough</span>
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Clusters in Project Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" />
                  <span>Monitored Bare-Metal Clusters ({activeTelemetry.clusters})</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Array.from({ length: activeTelemetry.clusters }).map((_, cIdx) => {
                    const cName = `${selectedProj}-cluster-${cIdx + 1}`;
                    return (
                      <div key={cIdx} className="p-6 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-4 shadow-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="font-mono font-extrabold text-white text-base">{cName}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Bare-metal control plane active on Intel Ice Lake nodes.</p>
                          </div>
                          <span className="bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-purple-500/30">
                            READY
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-800/80 text-xs font-mono text-center">
                          <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500 block text-[9px]">NODES</span><span className="text-white font-bold">3 HA</span></div>
                          <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500 block text-[9px]">VMS</span><span className="text-purple-300 font-bold">{Math.round(activeTelemetry.vms / activeTelemetry.clusters)} OCI</span></div>
                          <div className="bg-slate-900 p-2 rounded"><span className="text-slate-500 block text-[9px]">PODS</span><span className="text-sky-300 font-bold">{Math.round(activeTelemetry.pods / activeTelemetry.clusters)} Apps</span></div>
                        </div>

                        <button
                          onClick={() => {
                            setInspectedCluster(cName);
                            setActiveModalView('cluster');
                          }}
                          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition shadow-md shadow-purple-500/20 flex items-center justify-center gap-2"
                        >
                          <span>⚡ Open Cluster Operations Window →</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Project Operations Hub (Workloads, VMs, Performance, Self-Healing) */}
              <div className="pt-6 border-t border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-sky-400" />
                    <span>Project Administrative & Self-Healing Operations Hub</span>
                  </h4>
                  <span className="text-[11px] text-purple-400 font-mono">Project-Wide Administrative Suite ↓</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div
                    onClick={() => onNavigateTab && onNavigateTab('vms')}
                    className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-purple-500/50 cursor-pointer transition group flex flex-col justify-between space-y-3 shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white group-hover:text-purple-300 transition flex items-center gap-2 text-sm">
                          <Cpu className="w-4 h-4 text-purple-400" />
                          <span>Deploy Virtual Machines</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Launch Ubuntu/RHEL via KubeVirt CRDs across {selectedProj} clusters.</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-purple-300 flex-shrink-0" />
                    </div>
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between font-mono font-bold text-[11px] text-purple-400">
                      <span>OCI Container Disks</span>
                      <span>[ + Deploy VM ]</span>
                    </div>
                  </div>

                  <div
                    onClick={() => onNavigateTab && onNavigateTab('workloads')}
                    className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-sky-500/50 cursor-pointer transition group flex flex-col justify-between space-y-3 shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white group-hover:text-sky-300 transition flex items-center gap-2 text-sm">
                          <Layers className="w-4 h-4 text-sky-400" />
                          <span>Deploy K8s Workloads</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Containerized microservices with Service routing & Ingress load balancers.</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-sky-300 flex-shrink-0" />
                    </div>
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between font-mono font-bold text-[11px] text-sky-400">
                      <span>Ingress / L4 Service</span>
                      <span>[ + Deploy Pod ]</span>
                    </div>
                  </div>

                  <div
                    onClick={() => onNavigateTab && onNavigateTab('performance')}
                    className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-pink-500/50 cursor-pointer transition group flex flex-col justify-between space-y-3 shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white group-hover:text-pink-300 transition flex items-center gap-2 text-sm">
                          <Activity className="w-4 h-4 text-pink-400" />
                          <span>Run Performance Tests</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Execute sysbench, iperf3, and fio TopoLVM NVMe IOPS stress benchmark suites.</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-pink-300 flex-shrink-0" />
                    </div>
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between font-mono font-bold text-[11px] text-pink-400">
                      <span>fio / iperf3 Suite</span>
                      <span>[ 🚀 Run Benchmark ]</span>
                    </div>
                  </div>

                  <div
                    onClick={() => onNavigateTab && onNavigateTab('sentinel')}
                    className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition group flex flex-col justify-between space-y-3 shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white group-hover:text-emerald-300 transition flex items-center gap-2 text-sm">
                          <Bot className="w-4 h-4 text-emerald-400" />
                          <span>AI Self-Healing & Feedback Loops</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Explore active anomalies, trigger automated remediation, and inspect AI watchdog loops.</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-300 flex-shrink-0" />
                    </div>
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between font-mono font-bold text-[11px] text-emerald-400">
                      <span>Autonomous Watchdog</span>
                      <span>[ 🔧 Open Sentinel ]</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STATE 3: Cluster Operations Window */}
      {activeModalView === 'cluster' && inspectedCluster && (
        <div className="space-y-6 animate-fadeIn bg-slate-900/90 border-2 border-purple-500/50 rounded-3xl p-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModalView('project')}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                >
                  ⬅️ Return to Project Console
                </button>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Active Cluster Operations Console</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h3 className="text-2xl font-black text-white font-mono">{inspectedCluster}</h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 100% HEALTHY • BARE-METAL READY
                </span>
              </div>
            </div>
            <div className="text-right text-xs text-slate-400 font-mono bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 shadow">
              <div>Tenant: <strong className="text-white">{selectedProj}</strong></div>
              <div>Nodes: <strong className="text-sky-300">3x Ice Lake Bare-Metal</strong></div>
            </div>
          </div>

          {/* 1. Performance Metrics (vCPU / RAM Gauges & NVMe IOPS) */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>⚡ Real-Time Compute & Storage Allocation</span>
              <span className="text-[10px] text-sky-400 font-mono">4,200 NVMe IOPS Active</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between shadow-inner">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><Cpu className="w-4 h-4 text-sky-400" /><span>vCPU Allocation</span></span>
                  <span className="font-mono text-sky-400 font-black">75%</span>
                </div>
                <div className="my-2.5 flex items-center justify-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90"><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" className="text-slate-800 fill-none" /><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" strokeDasharray={163} strokeDashoffset={163 - (163 * 75) / 100} className="text-sky-500 fill-none transition-all duration-700" strokeLinecap="round" /></svg>
                    <span className="absolute font-mono font-bold text-[11px] text-white">24/32</span>
                  </div>
                </div>
                <div className="text-[10px] text-center text-slate-400">Intel Bare-Metal Nodes</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between shadow-inner">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-purple-400" /><span>RAM In-Use</span></span>
                  <span className="font-mono text-purple-400 font-black">82%</span>
                </div>
                <div className="my-2.5 flex items-center justify-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90"><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" className="text-slate-800 fill-none" /><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" strokeDasharray={163} strokeDashoffset={163 - (163 * 82) / 100} className="text-purple-500 fill-none transition-all duration-700" strokeLinecap="round" /></svg>
                    <span className="absolute font-mono font-bold text-[11px] text-white">105GB</span>
                  </div>
                </div>
                <div className="text-[10px] text-center text-slate-400">128GB Total ECC Memory</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between shadow-inner">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-pink-400" /><span>TopoLVM NVMe</span></span>
                  <span className="font-mono text-pink-400 font-black">64%</span>
                </div>
                <div className="my-2.5 flex items-center justify-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90"><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" className="text-slate-800 fill-none" /><circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" strokeDasharray={163} strokeDashoffset={163 - (163 * 64) / 100} className="text-pink-500 fill-none transition-all duration-700" strokeLinecap="round" /></svg>
                    <span className="absolute font-mono font-bold text-[11px] text-white">1.4TB</span>
                  </div>
                </div>
                <div className="text-[10px] text-center text-slate-400">2.0TB Local RWO Volume</div>
              </div>
            </div>
          </div>

          {/* 2. Deployed Workloads Roster */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>🪟 Deployed Workloads & Virtual Machines</span>
              <span className="text-[10px] text-emerald-400 font-mono">4 Active Runtimes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div><div className="font-bold text-white">elera-pos-engine-v4</div><div className="text-[10px] text-slate-400">K8s Container Pod • Port 8080</div></div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">RUNNING</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div><div className="font-bold text-white">redis-session-cache-ha</div><div className="text-[10px] text-slate-400">K8s Container Pod • Port 6379</div></div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">RUNNING</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div><div className="font-bold text-white">win-pos-controller-01</div><div className="text-[10px] text-slate-400">KubeVirt OCI VM • WinServer 2022</div></div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">OCI VM</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <div><div className="font-bold text-white">rhel9-db-node</div><div className="text-[10px] text-slate-400">KubeVirt OCI VM • RHEL 9 SQL Core</div></div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">OCI VM</span>
              </div>
            </div>
          </div>

          {/* 3. Current Operations & Errors Box */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 font-black">
                ✓
              </div>
              <div className="text-xs">
                <div className="font-extrabold text-white">Current Operations: 0 Errors Detected</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Automated TopoLVM volume snapshot backup completed 2m ago. All node components SLA 100%.</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => onNavigateTab && onNavigateTab('vms')}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition shadow-md shadow-purple-500/20"
              >
                Open VM Console →
              </button>
              <button
                onClick={() => onNavigateTab && onNavigateTab('workloads')}
                className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition shadow-md shadow-sky-500/20"
              >
                Open K8s Console →
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
