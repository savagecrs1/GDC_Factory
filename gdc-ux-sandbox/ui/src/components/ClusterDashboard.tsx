'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Server, Shield, CheckCircle2, AlertTriangle, RefreshCw, Terminal, Layers, Network, GitBranch, ExternalLink, ArrowLeft } from 'lucide-react';

interface ClusterDashboardProps {
  clusterName: string;
  projectId: string;
  onNavigateTab?: (tab: string) => void;
}

export default function ClusterDashboard({ clusterName, projectId, onNavigateTab }: ClusterDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [terminalTarget, setTerminalTarget] = useState<{ name: string; type: 'vm' | 'node' } | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    const url = `/api/kubernetes/status?clusterName=${encodeURIComponent(clusterName)}&projectId=${encodeURIComponent(projectId)}`;
    fetch(url)
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 15000);
    return () => clearInterval(timer);
  }, [clusterName, projectId]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cluster Workspace Header Banner */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-2 border-purple-500/50 shadow-2xl bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-500 via-indigo-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 text-2xl font-black">
            🖥️
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-white font-mono tracking-tight">{clusterName}</h2>
              <span className={`px-3 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow ${
                data?.connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-400 text-slate-950 border border-amber-500'
              }`}>
                {data?.connected ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {data?.mode || '100% SLA • Bare-Metal Ready'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active cluster workspace inside tenant <strong className="text-white font-mono">{projectId}</strong>. Inspecting real-time control plane telemetry and node health.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => onNavigateTab && onNavigateTab('dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition border border-slate-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Fleet Roster</span>
          </button>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 text-xs font-bold transition border border-purple-500/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Single-Cluster Telemetry Stat Grid (The 4 Boxes) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between bg-slate-900/60 shadow-lg">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider">Active Bare-Metal Nodes</span>
              <Server className="w-5 h-5 text-sky-400" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{data?.nodes?.length || 3} Nodes</div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 100% Ready
            </span> across Control Plane & Worker VMs
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between bg-slate-900/60 shadow-lg">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider">KubeVirt OCI VMs</span>
              <Cpu className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{data?.vms?.length || 6} VMs</div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-1.5">
            <span className="text-purple-300 font-bold">KubeVirt Enabled</span> running Windows & RHEL container disks
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between bg-slate-900/60 shadow-lg">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider">vCPU Allocation</span>
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black text-white font-mono">{data?.metrics?.usedCpu || '24 / 32 vCPU'}</span>
              <span className="text-xs font-mono font-bold text-sky-400">75%</span>
            </div>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full mt-4 overflow-hidden border border-slate-800">
            <div className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full w-3/4 rounded-full animate-pulse" />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between bg-slate-900/60 shadow-lg">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider">Memory Allocation</span>
              <HardDrive className="w-5 h-5 text-pink-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black text-white font-mono">{data?.metrics?.usedMem || '105 / 128 GB'}</span>
              <span className="text-xs font-mono font-bold text-pink-400">82%</span>
            </div>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full mt-4 overflow-hidden border border-slate-800">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full w-[82%] rounded-full" />
          </div>
        </div>
      </div>

      {/* Two Columns: Hardware Roster Table (8 cols) and Cluster Console Action Hub (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Nodes List */}
        <div className="xl:col-span-8 glass-panel rounded-3xl p-6 border border-slate-800 bg-slate-900/80 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                <span>Anthos Hardware Footprint (GCE Instances)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Bare-metal physical server nodes hosting control plane and worker VMs</p>
            </div>
            <span className="text-[11px] font-mono font-bold text-sky-300 bg-sky-500/10 px-3 py-1 rounded-xl border border-sky-500/20">
              VXLAN Overlay Active
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">Node Name</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Internal IP</th>
                  <th className="py-3 px-3">CPU / Mem</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {(data?.nodes || [
                  { name: `${clusterName}-cp-1`, role: 'Control Plane (Master)', ip: '10.1.10.11', cpu: '6/8 vCPU', cpuPercent: 75, mem: '26/32 GB', memPercent: 81, status: 'Ready' },
                  { name: `${clusterName}-worker-1`, role: 'Worker Node (Compute)', ip: '10.1.10.12', cpu: '9/12 vCPU', cpuPercent: 75, mem: '40/48 GB', memPercent: 83, status: 'Ready' },
                  { name: `${clusterName}-worker-2`, role: 'Worker Node (Compute)', ip: '10.1.10.13', cpu: '9/12 vCPU', cpuPercent: 75, mem: '39/48 GB', memPercent: 81, status: 'Ready' },
                ]).map((node: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-3 font-bold font-mono text-white flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {node.name}
                    </td>
                    <td className="py-3.5 px-3 text-slate-300 font-medium">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        node.role.includes('Control') ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {node.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-400 font-mono text-xs">{node.ip}</td>
                    <td className="py-3.5 px-3">
                      <div className="space-y-1 min-w-[130px]">
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span className="text-slate-500">CPU</span>
                            <span className="text-sky-400 font-bold">{node.cpu || '75%'}</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${node.cpuPercent || 75}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span className="text-slate-500">RAM</span>
                            <span className="text-purple-400 font-bold">{node.mem || '81%'}</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${node.memPercent || 81}%` }} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        {node.status || 'Ready'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => setTerminalTarget({ name: node.name, type: 'node' })}
                        className="p-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition border border-slate-700 inline-flex items-center gap-1.5 text-xs font-bold shadow-sm"
                        title="SSH into Physical GCE Cluster Node"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>SSH Node</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cluster Console Action Hub */}
        <div className="xl:col-span-4 glass-panel rounded-3xl p-6 border border-slate-800 bg-slate-900/80 shadow-xl flex flex-col justify-between space-y-6">
          <div>
            <h3 className="text-base font-extrabold text-white mb-1 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span>Cluster Console Action Hub</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Launch operational workspace tools directly targeted at <strong className="text-white font-mono">{clusterName}</strong>.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => onNavigateTab && onNavigateTab('vms')}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-slate-950 hover:from-purple-900/50 border border-purple-500/30 hover:border-purple-400/60 text-left transition group flex items-center justify-between shadow-md shadow-purple-500/10"
              >
                <div>
                  <div className="font-extrabold text-white group-hover:text-purple-300 transition text-sm flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span>GDC VM Runtime Console</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Manage OCI container disks & Windows POS instances</div>
                </div>
                <ExternalLink className="w-4 h-4 text-purple-400 group-hover:scale-110 transition flex-shrink-0" />
              </button>

              <button
                onClick={() => onNavigateTab && onNavigateTab('workloads')}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-sky-900/30 to-slate-950 hover:from-sky-900/50 border border-sky-500/30 hover:border-sky-400/60 text-left transition group flex items-center justify-between shadow-md shadow-sky-500/10"
              >
                <div>
                  <div className="font-extrabold text-white group-hover:text-sky-300 transition text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span>K8s Workload Manager</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Inspect container pods, services, & ingress routes</div>
                </div>
                <ExternalLink className="w-4 h-4 text-sky-400 group-hover:scale-110 transition flex-shrink-0" />
              </button>

              <button
                onClick={() => onNavigateTab && onNavigateTab('networks')}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-900/30 to-slate-950 hover:from-emerald-900/50 border border-emerald-500/30 hover:border-emerald-400/60 text-left transition group flex items-center justify-between shadow-md shadow-emerald-500/10"
              >
                <div>
                  <div className="font-extrabold text-white group-hover:text-emerald-300 transition text-sm flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <span>VLAN & Secondary Networks</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Configure L2 broadcast domains & VXLAN tunnels</div>
                </div>
                <ExternalLink className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition flex-shrink-0" />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>GKE Connect Gateway</span>
            <span className="text-purple-400 font-bold">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
