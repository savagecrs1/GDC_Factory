'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Server, Shield, CheckCircle2, AlertTriangle, RefreshCw, Play, Square, ExternalLink, Terminal, ShieldAlert, Zap, CheckCircle } from 'lucide-react';
import WebTerminalModal from './WebTerminalModal';

interface DashboardProps {
  clusterName: string;
  projectId?: string;
  setActiveTab: (tab: string) => void;
}

export default function Dashboard({ clusterName, projectId, setActiveTab }: DashboardProps) {
  const [data, setData] = useState<any>(null);
  const [triageReports, setTriageReports] = useState<any[]>([]);
  const [executingFix, setExecutingFix] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminalTarget, setTerminalTarget] = useState<{ name: string; type: 'vm' | 'node' } | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    const url = `/api/kubernetes/status?clusterName=${encodeURIComponent(clusterName)}` + (projectId ? `&projectId=${encodeURIComponent(projectId)}` : '');
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

    fetch('/api/sentinel/status')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.triageReports) setTriageReports(resData.triageReports);
      })
      .catch(console.error);
  };

  const handleExecuteFix = async (id: string) => {
    setExecutingFix(id);
    setFixResult(null);
    try {
      const res = await fetch('/api/sentinel/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remediate', id }),
      });
      const resData = await res.json();
      setFixResult({ id, success: res.ok, message: resData.message || resData.error });
      fetchStatus();
    } catch (err: any) {
      setFixResult({ id, success: false, message: err.message || 'Network error' });
    } finally {
      setExecutingFix(null);
    }
  };

  const handleIgnoreReport = async (id: string) => {
    await fetch('/api/sentinel/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, status: 'ignored' }),
    });
    fetchStatus();
  };

  const handleClearAllReports = async () => {
    setTriageReports([]);
    await fetch('/api/sentinel/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    fetchStatus();
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 15000);
    return () => clearInterval(timer);
  }, [clusterName, projectId]);

  return (
    <div className="space-y-6">
      {/* Top Status Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-sky-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">Cluster Environment Health</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                data?.connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-400 text-slate-950 border border-amber-500 font-bold shadow-sm'
              }`}>
                {data?.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {data?.mode || 'Loading...'}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Managing hybrid GDC Connected Servers workload footprint for <strong className="text-slate-200">{clusterName}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {!data?.connected && (
            <button
              onClick={() => {
                setActiveTab('sentinel');
                fetch('/api/sentinel/triage', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'diagnose', clusterName, projectId: projectId || 'core-edge-dm1' }),
                });
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm font-bold border border-amber-500/40 transition shadow-md shadow-amber-500/10 animate-pulse"
              title="Trigger Sentinel AI Watchdog deep diagnostic audit for this cluster"
            >
              🔍 Why don't I see my cluster?
            </button>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setActiveTab('provision')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-sky-500/20 transition"
          >
            Deploy New Cluster
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-panel-interactive p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-sm font-semibold">Active Nodes</span>
              <Server className="w-5 h-5 text-sky-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{data?.nodes?.length || 0}</div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">100% Ready</span> across Control Plane & Worker VMs
          </div>
        </div>

        <div className="glass-panel-interactive p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-sm font-semibold">Virtual Machines (GDC Runtime)</span>
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{data?.vms?.length || 0}</div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-1.5">
            <span className="text-indigo-400 font-semibold">KubeVirt Enabled</span> running Edge AI workloads
          </div>
        </div>

        <div className="glass-panel-interactive p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-sm font-semibold">vCPU Allocation</span>
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{data?.metrics?.usedCpu || '0 vCPU'}</div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-sky-500 h-full w-[45%]" />
          </div>
        </div>

        <div className="glass-panel-interactive p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-sm font-semibold">Memory Allocation</span>
              <HardDrive className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{data?.metrics?.usedMem || '0 GB'}</div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full w-[42%]" />
          </div>
        </div>
      </div>

      {/* Two Columns: Active Nodes (8 cols) and Quick Action Launchers (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Nodes List */}
        <div className="xl:col-span-8 glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-sky-400" />
              Anthos Hardware Footprint (GCE Instances)
            </h3>
            <span className="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">VXLAN Secondary Network</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Node Name</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Internal IP</th>
                  <th className="py-3 px-4 font-semibold">CPU / Mem</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {data?.nodes?.map((node: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      {node.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        node.role.includes('Control') ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {node.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">{node.ip}</td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5 min-w-[140px]">
                        <div>
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="text-slate-500">CPU</span>
                            <span className="font-mono text-sky-400">{node.cpu || 'N/A'}</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${node.cpuPercent || 5}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="text-slate-500">RAM</span>
                            <span className="font-mono text-purple-400">{node.mem || 'N/A'}</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${node.memPercent || 5}%` }} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        {node.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setTerminalTarget({ name: node.name, type: 'node' })}
                        className="p-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition border border-slate-700 inline-flex items-center gap-1.5 text-xs font-medium shadow-sm"
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

        {/* Quick Launchers */}
        <div className="xl:col-span-4 glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              GDC Operations Hub
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Quickly launch new workloads or virtual machines into the GDC Connected Servers environment.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setActiveTab('vms')}
                className="w-full p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/60 text-left transition group flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-white group-hover:text-sky-400 transition text-sm">Deploy Virtual Machine</div>
                  <div className="text-xs text-slate-400 mt-0.5">Launch Ubuntu/RHEL via KubeVirt CRDs</div>
                </div>
                <Cpu className="w-5 h-5 text-sky-400 group-hover:scale-110 transition" />
              </button>

              <button
                onClick={() => setActiveTab('workloads')}
                className="w-full p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/60 text-left transition group flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-white group-hover:text-indigo-400 transition text-sm">Deploy K8s Workload</div>
                  <div className="text-xs text-slate-400 mt-0.5">Containerized app with Service routing</div>
                </div>
                <Activity className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" />
              </button>

              <button
                onClick={() => setActiveTab('provision')}
                className="w-full p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/60 text-left transition group flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-white group-hover:text-emerald-400 transition text-sm">Provision Infrastructure</div>
                  <div className="text-xs text-slate-400 mt-0.5">Run Terraform & Ansible automation</div>
                </div>
                <Server className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" />
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>GKE Connect Gateway Ready</span>
            <span className="text-sky-400 font-mono">v2.14-hybrid</span>
          </div>
        </div>
      </div>

      {/* AI Watchdog Triage Alert Screen (Always Visible Overview Console) */}
      <div className={`glass-panel rounded-2xl border overflow-hidden p-6 space-y-4 shadow-xl transition ${
        triageReports.filter((r) => r.status === 'open').length > 0
          ? 'border-rose-500/40 bg-rose-500/5 shadow-rose-500/10'
          : 'border-slate-800 bg-slate-900/40'
      }`}>
        <div className={`flex items-center justify-between border-b pb-3 ${
          triageReports.filter((r) => r.status === 'open').length > 0 ? 'border-rose-500/20' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {triageReports.filter((r) => r.status === 'open').length > 0 ? (
              <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">GDC Sentinel AI Watchdog: Active Triage Alerts</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                  triageReports.filter((r) => r.status === 'open').length > 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {triageReports.filter((r) => r.status === 'open').length} CURRENT
                </span>
              </div>
              <p className="text-xs text-slate-400">Automated root cause analysis and log inspection for cluster provisioning & VM workloads</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {triageReports.filter((r) => r.status === 'open').length > 0 && (
              <button
                onClick={handleClearAllReports}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Dismiss All Alerts
              </button>
            )}
            <button
              onClick={() => setActiveTab('sentinel')}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <span>Open Sentinel Hub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {triageReports.filter((r) => r.status === 'open').length === 0 ? (
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">0 Active Triage Alerts (Nominal State)</h4>
                <p className="text-xs text-slate-400 mt-0.5">Sentinel AI Watchdog is actively monitoring real-time telemetry, Ansible execution logs, and K8s CRDs. All systems nominal!</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono whitespace-nowrap">
              🟢 ALL SYSTEMS HEALTHY
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {triageReports.filter((r) => r.status === 'open').slice(0, 4).map((report: any) => (
              <div key={report.id} className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/30 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500 text-white">
                    {report.severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{new Date(report.timestamp).toLocaleTimeString()}</span>
                </div>
                <h4 className="font-bold text-white text-sm">{report.errorTitle}</h4>
                <p className="text-xs text-slate-300"><strong className="text-rose-300">Root Cause:</strong> {report.rootCause}</p>
                
                {report.autoFixAvailable && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <code className="text-[10px] font-mono bg-slate-950 px-2 py-1 rounded text-slate-400 truncate max-w-[180px]">
                      {report.autoFixCommand}
                    </code>
                    <button
                      onClick={() => handleExecuteFix(report.id)}
                      disabled={executingFix === report.id}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-white font-semibold text-[11px] flex items-center gap-1 shadow transition flex-shrink-0"
                    >
                      {executingFix === report.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-white" />}
                      <span>Auto-Remediate</span>
                    </button>
                  </div>
                )}
                {fixResult && fixResult.id === report.id && (
                  <div className={`mt-2 p-2 rounded text-[10px] font-mono ${fixResult.success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                    {fixResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Operations & System Audit Log */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Recent Operations & System Audit Log</h3>
              <p className="text-xs text-slate-400">Chronological audit trail of VM deployments, RBAC bindings, terminal execs, and cluster automations</p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-500">Live Audit Trail</span>
        </div>

        <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
          {(data?.auditLog || []).map((item: any) => (
            <div key={item.id} className="p-4 hover:bg-slate-800/30 transition flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                  item.status === 'success' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' :
                  item.status === 'error' ? 'bg-rose-500 shadow-sm shadow-rose-500/50' : 'bg-sky-400'
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{item.action}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-300">
                      {item.target}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{item.details}</p>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Web Terminal Modal */}
      {terminalTarget && (
        <WebTerminalModal
          isOpen={!!terminalTarget}
          onClose={() => setTerminalTarget(null)}
          targetType={terminalTarget.type}
          targetName={terminalTarget.name}
          projectId={projectId || 'vdc-18818'}
        />
      )}
    </div>
  );
}
