'use client';

import React, { useState, useEffect } from 'react';
import { Server, Activity, Cpu, HardDrive, RefreshCw, Folder, Search, Plus, ArrowRight, AlertTriangle, ChevronRight, Check, Network } from 'lucide-react';
import ProjectSelector from '@/components/ProjectSelector';
import NetworkDiagnosticModal from '@/components/NetworkDiagnosticModal';

interface ClusterInfo {
  name: string;
  status: 'Connected' | 'Offline' | 'Provisioning';
  nodeCount: number;
  vmCount: number;
  usedCpu: string;
  usedMem: string;
  projectId: string;
  source?: 'live' | 'fallback';
}

interface ProjectInfo {
  projectId: string;
  name: string;
}

interface FleetManagerProps {
  projectId: string;
  setProjectId: (id: string) => void;
  setClusterName: (name: string) => void;
  setActiveTab: (tab: string) => void;
}

export default function FleetManager({
  projectId,
  setProjectId,
  setClusterName,
  setActiveTab,
}: FleetManagerProps) {
  const [projectsList, setProjectsList] = useState<ProjectInfo[]>([]);
  const [projectClusterCounts, setProjectClusterCounts] = useState<{ [id: string]: number }>({});
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [refreshingCounts, setRefreshingCounts] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);

  // 1. Fetch GCP projects and cluster counts on mount / refresh
  const loadProjectsAndCounts = () => {
    setLoadingProjects(true);
    fetch('/api/gcp/projects')
      .then((res) => res.json())
      .then(async (data) => {
        const list = data.projects || [];
        setProjectsList(list);
        setLoadingProjects(false);

        // Pre-select first project if none is active
        if (list.length > 0 && !projectId) {
          setProjectId(list[0].projectId);
        }

        // Fetch counts for all projects in parallel
        setRefreshingCounts(true);
        const counts: { [id: string]: number } = {};
        await Promise.all(list.map(async (p: any) => {
          try {
            const res = await fetch(`/api/gcp/clusters?projectId=${encodeURIComponent(p.projectId)}`);
            const cData = await res.json();
            counts[p.projectId] = cData.clusters?.length || 0;
          } catch {
            counts[p.projectId] = 0;
          }
        }));
        setProjectClusterCounts(counts);
        setRefreshingCounts(false);
      })
      .catch((err) => {
        console.error('Failed to load GCP projects:', err);
        setLoadingProjects(false);
      });
  };

  useEffect(() => {
    loadProjectsAndCounts();
  }, []);

  // 2. Load cluster list and details whenever active projectId changes
  const fetchClustersForActiveProject = () => {
    if (!projectId) return;
    setLoadingClusters(true);
    fetch(`/api/gcp/clusters?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => res.json())
      .then(async (data) => {
        const clusterNames = data.clusters || [];
        if (clusterNames.length === 0) {
          setClusters([]);
          setLoadingClusters(false);
          return;
        }

        const detailsPromises = clusterNames.map(async (name: string) => {
          try {
            const res = await fetch(`/api/kubernetes/status?clusterName=${encodeURIComponent(name)}&projectId=${encodeURIComponent(projectId)}`);
            const statusData = await res.json();
            return {
              name,
              status: statusData.connected ? 'Connected' : 'Offline',
              nodeCount: statusData.nodes?.length || 0,
              vmCount: statusData.vms?.length || 0,
              usedCpu: statusData.metrics?.usedCpu || '0 vCPU',
              usedMem: statusData.metrics?.usedMem || '0 GB',
              projectId,
              source: data.source,
            } as ClusterInfo;
          } catch {
            return {
              name,
              status: 'Offline',
              nodeCount: 0,
              vmCount: 0,
              usedCpu: 'N/A',
              usedMem: 'N/A',
              projectId,
              source: data.source,
            } as ClusterInfo;
          }
        });

        const detailedClusters = await Promise.all(detailsPromises);
        setClusters(detailedClusters);
        setLoadingClusters(false);
      })
      .catch((err) => {
        console.error('Error fetching cluster details:', err);
        setLoadingClusters(false);
      });
  };

  useEffect(() => {
    fetchClustersForActiveProject();
  }, [projectId]);

  const handleDrillDown = (name: string, targetTab = 'dashboard') => {
    setClusterName(name);
    setActiveTab(targetTab);
  };

  const handleProjectSelect = (id: string) => {
    setProjectId(id);
  };

  // Filter projects by search query
  const filteredProjects = projectsList.filter(
    (p) =>
      p.projectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* 1. LEFT SIDEBAR: GCP Project Catalog */}
      <div className="lg:col-span-1 glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 h-fit">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-white text-sm">GCP Projects</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Discovered via active ADC</p>
          </div>
          <button 
            onClick={loadProjectsAndCounts}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingCounts ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Project Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Projects List */}
        <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
          {loadingProjects ? (
            <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Scanning GCP metadata...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 italic">No matching projects</div>
          ) : (
            filteredProjects.map((p) => {
              const isSelected = p.projectId === projectId;
              const hasCount = p.projectId in projectClusterCounts;
              const count = projectClusterCounts[p.projectId] || 0;

              return (
                <button
                  key={p.projectId}
                  onClick={() => handleProjectSelect(p.projectId)}
                  className={`w-full p-2.5 rounded-xl text-left text-xs transition flex items-center justify-between border ${
                    isSelected
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 font-bold'
                      : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="truncate font-semibold">{p.projectId}</div>
                    <div className="text-[9px] text-slate-500 truncate mt-0.5">{p.name || p.projectId}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasCount ? (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        count > 0 ? 'bg-sky-500/25 text-sky-300' : 'bg-slate-950 text-slate-650 border border-slate-900'
                      }`}>
                        {count} {count === 1 ? 'cluster' : 'clusters'}
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-755 animate-pulse" />
                    )}
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>
        
        {/* Dynamic selector to create a project */}
        <div className="pt-2 border-t border-slate-800">
          <ProjectSelector projectId="" setProjectId={handleProjectSelect} className="w-full" />
        </div>
      </div>

      {/* 2. MAIN HUB PANEL: Active project fleet list or onboarding */}
      <div className="lg:col-span-3 space-y-6">
        {!projectId ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 glass-panel p-8 rounded-2xl border border-slate-800 text-center">
            <Folder className="w-10 h-10 text-slate-500 animate-pulse" />
            <p className="text-slate-400 text-sm">Please select a GCP Project from the catalog to discover Edge virtual fleets.</p>
          </div>
        ) : loadingClusters ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 glass-panel p-8 rounded-2xl border border-slate-800 text-center">
            <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Scanning memberships in {projectId}...</p>
          </div>
        ) : clusters.length === 0 ? (
          /* Onboarding Setup view if project has 0 clusters */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mx-auto animate-pulse">
              <Server className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">GDC Edge Console Onboarding</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                No active virtual edge environments were discovered in project <strong className="text-slate-200">{projectId}</strong>.
              </p>
            </div>

            <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 text-left space-y-3 max-w-lg mx-auto">
              <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider">📦 Sandbox Onboarding Step:</h3>
              <div className="flex gap-3 text-xs text-slate-300">
                <div className="w-5 h-5 rounded-full bg-sky-500/25 flex items-center justify-center text-sky-300 font-bold shrink-0">1</div>
                <div>
                  <strong>Provision Virtual Edge Cluster</strong>
                  <p className="text-slate-500 mt-0.5 leading-snug">Stamp out standard bare-metal Anthos VMs, VPC, NAT subnets, and Connect Gateways.</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-slate-300 pt-2 border-t border-slate-900">
                <div className="w-5 h-5 rounded-full bg-indigo-500/25 flex items-center justify-center text-indigo-300 font-bold shrink-0">2</div>
                <div>
                  <strong>Ingest Workloads (Optional)</strong>
                  <p className="text-slate-500 mt-0.5 leading-snug">Pre-load the cluster with POS Checkout Engine, Redis database cache, or default VMs.</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setActiveTab('provision')}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-650 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg flex items-center justify-center gap-2 transition"
              >
                <span>🚀 Yes, Provision a Virtual Cluster</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Main Fleet Grid display */
          <>
            {/* Top Banner & Stats */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-l-4 border-l-sky-500">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-white tracking-tight">Edge Fleet Hub</h2>
                <p className="text-sm text-slate-400">
                  Monitoring active bare-metal environments across project <strong className="text-slate-200">{projectId}</strong>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsDiagnosticOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-300 text-xs font-bold transition shadow-sm"
                  title="Run 5-layer diagnostic probes (Google APIs, QBone ALPN, VLAN 802.1Q, Cloud NAT MTU)"
                >
                  <Network className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                  Test GDC Connectivity
                </button>
                <button
                  onClick={fetchClustersForActiveProject}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Fleet
                </button>
                <button
                  onClick={() => setActiveTab('provision')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-extrabold shadow-md transition"
                >
                  Deploy New Cluster
                </button>
              </div>
            </div>

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-semibold block mb-1">Total Active Clusters</span>
                  <span className="text-2xl font-black text-white">{clusters.filter(c => c.status === 'Connected').length} / {clusters.length}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
                  <Server className="w-5 h-5" />
                </div>
              </div>
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-semibold block mb-1">Total Fleet Nodes</span>
                  <span className="text-2xl font-black text-white">{clusters.reduce((acc, c) => acc + c.nodeCount, 0)}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-semibold block mb-1">Running Edge VMs</span>
                  <span className="text-2xl font-black text-white">{clusters.reduce((acc, c) => acc + c.vmCount, 0)}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Cpu className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Grid of Cluster status cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clusters.map((c) => (
                <div
                  key={c.name}
                  className={`glass-panel p-6 rounded-2xl border ${c.status === 'Connected' ? 'border-slate-800 hover:border-sky-550/40' : 'border-slate-800/80 hover:border-slate-700'} transition-all flex flex-col justify-between space-y-5`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-white text-base truncate max-w-[200px]" title={c.name}>{c.name}</h3>
                          {c.source === 'fallback' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] uppercase font-black border border-amber-500/30">
                              Simulated
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{c.projectId}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-[11px] uppercase font-black tracking-wider flex items-center gap-1.5 shadow-md border ${
                        c.status === 'Connected' ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/30 text-rose-300 border-rose-500/40'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${c.status === 'Connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-450'}`} />
                        {c.status}
                      </span>
                    </div>

                    {c.status === 'Connected' ? (
                      <div className="grid grid-cols-2 gap-3.5 bg-slate-950/80 p-3 rounded-xl border border-slate-850 text-xs">
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase font-semibold">Allocated vCPU</span>
                          <div className="text-white font-extrabold mt-0.5 flex items-center gap-1">
                            <Cpu className="w-3.5 h-3.5 text-sky-400" />
                            {c.usedCpu}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase font-semibold">Allocated RAM</span>
                          <div className="text-white font-extrabold mt-0.5 flex items-center gap-1">
                            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                            {c.usedMem}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase font-semibold">K8s Nodes</span>
                          <div className="text-white font-extrabold mt-0.5">{c.nodeCount} Bare-metal</div>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase font-semibold">KubeVirt VMs</span>
                          <div className="text-white font-extrabold mt-0.5">{c.vmCount} Virtual</div>
                        </div>
                      </div>
                    ) : (
                      <div className={`bg-slate-950/60 p-4 rounded-xl border border-slate-850/60 flex items-center gap-2.5 text-xs ${
                        c.source === 'fallback' ? 'text-amber-300 border-amber-500/30 bg-amber-500/5' : 'text-rose-300'
                      }`}>
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {c.source === 'fallback'
                            ? 'Cluster is emulated. No active physical instances provisioned in this project.'
                            : 'K8s Control plane unreachable. Connection Gateway gateway-link down.'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Links Dashboard Footer */}
                  {c.status === 'Connected' && (
                    <div className="border-t border-slate-800 pt-4 grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-400">
                      <button
                        onClick={() => handleDrillDown(c.name, 'vms')}
                        className="py-1 rounded bg-slate-800/40 hover:bg-slate-800 hover:text-white transition flex items-center justify-center gap-1"
                      >
                        🖥️ VMs
                      </button>
                      <button
                        onClick={() => handleDrillDown(c.name, 'workloads')}
                        className="py-1 rounded bg-slate-800/40 hover:bg-slate-800 hover:text-white transition flex items-center justify-center gap-1"
                      >
                        📦 Workloads
                      </button>
                      <button
                        onClick={() => handleDrillDown(c.name, 'sentinel')}
                        className="py-1 rounded bg-slate-800/40 hover:bg-slate-800 hover:text-white transition flex items-center justify-center gap-1"
                      >
                        🛡️ Watchdog
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleDrillDown(c.name, 'dashboard')}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-650 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Drill Down into Cluster</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <NetworkDiagnosticModal
        isOpen={isDiagnosticOpen}
        onClose={() => setIsDiagnosticOpen(false)}
        projectId={projectId}
        clusterName={clusters[0]?.name || 'gdc-edge-cluster'}
      />
    </div>
  );
}
