'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Server, Cpu, Activity, RefreshCw, Layers, Terminal, ArrowUpRight, Zap, CheckCircle2, HardDrive, Shield, ExternalLink, Network } from 'lucide-react';

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
            <div className="space-y-6 my-auto">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Active Tenant Project Roster</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h3 className="text-2xl font-black text-white font-mono">{selectedProj}</h3>
                      <span className="bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {activeTelemetry.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400 font-mono bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    <div>Hardware: <strong className="text-white">{activeTelemetry.nodes}</strong></div>
                    <div>Overlay: <strong className="text-sky-300">{activeTelemetry.vlans}</strong></div>
                  </div>
                </div>

                <div className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Server className="w-4 h-4 text-purple-400" />
                      <span>Existing Bare-Metal Clusters in {selectedProj} ({activeTelemetry.clusters})</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">Select a cluster below to enter its workspace and view vCPU/RAM/VM allocation</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: activeTelemetry.clusters }).map((_, cIdx) => {
                      const cName = `${selectedProj}-cluster-${cIdx + 1}`;
                      return (
                        <div
                          key={cIdx}
                          onClick={() => onNavigateTab && onNavigateTab('cluster-view')}
                          className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 hover:border-purple-500/60 cursor-pointer transition group shadow-lg flex flex-col justify-between space-y-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="font-mono font-extrabold text-white text-base group-hover:text-purple-300 transition">{cName}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Bare-metal control plane active on Intel Ice Lake nodes.</p>
                            </div>
                            <span className="bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-purple-500/30">
                              READY
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800/80 text-[11px] font-mono text-center">
                            <div className="bg-slate-900/80 p-1.5 rounded"><span className="text-slate-500 block text-[9px]">NODES</span><span className="text-white font-bold">3 HA</span></div>
                            <div className="bg-slate-900/80 p-1.5 rounded"><span className="text-slate-500 block text-[9px]">VMS</span><span className="text-purple-300 font-bold">{Math.round(activeTelemetry.vms / activeTelemetry.clusters)} OCI</span></div>
                            <div className="bg-slate-900/80 p-1.5 rounded"><span className="text-slate-500 block text-[9px]">PODS</span><span className="text-sky-300 font-bold">{Math.round(activeTelemetry.pods / activeTelemetry.clusters)} Apps</span></div>
                          </div>

                          <div className="flex items-center justify-between text-xs font-bold text-purple-400 group-hover:text-purple-300">
                            <span>🖥️ Enter Cluster Workspace & Telemetry →</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add another cluster button card */}
                    <div
                      onClick={() => onNavigateTab && onNavigateTab('provision')}
                      className="p-5 rounded-2xl bg-slate-950/40 border-2 border-dashed border-slate-800 hover:border-sky-500/50 cursor-pointer transition flex flex-col items-center justify-center text-center p-6 space-y-2 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition text-lg font-black">
                        +
                      </div>
                      <div className="font-bold text-white text-sm group-hover:text-sky-300">Provision Another Cluster</div>
                      <p className="text-[11px] text-slate-500 max-w-[220px]">Launch the Terraform & Ansible bare-metal deployment engine inside {selectedProj}.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Launch Console Action Bar */}
              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-400">⚡ Tenant-level administrative actions:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigateTab && onNavigateTab('networks')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center gap-1.5 border border-slate-700"
                  >
                    <Network className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Manage VLANs & Overlays</span>
                  </button>
                  <button
                    onClick={() => onNavigateTab && onNavigateTab('configsync')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center gap-1.5 border border-slate-700"
                  >
                    <Shield className="w-3.5 h-3.5 text-pink-400" />
                    <span>GitOps Policy Sync</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
