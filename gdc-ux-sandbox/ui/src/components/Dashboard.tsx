'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Server, Shield, CheckCircle2, AlertTriangle, RefreshCw, Play, Square, ExternalLink, Terminal, ShieldAlert, Zap, CheckCircle } from 'lucide-react';
import WebTerminalModal from './WebTerminalModal';
import FleetOperationsCenter from './FleetOperationsCenter';

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
  const [harnessReport, setHarnessReport] = useState<any>(null);
  const [showHarnessModal, setShowHarnessModal] = useState(false);
  const [showHarnessMenu, setShowHarnessMenu] = useState(false);
  const [harnessConfig, setHarnessConfig] = useState<any>({
    emailAlerts: '',
    notifyOnSuccess: true,
    notifyOnError: true,
    runProvisioning: false,
    runVms: true,
    runWorkloads: true,
    runBenchmarks: true,
    benchmarkFio: true,
    benchmarkIperf: true,
    benchmarkMongo: true,
    benchmarkRedis: true,
    benchmarkPg: false,
    runSentinel: true,
    runTeardown: false
  });

  const fetchHarnessStatus = () => {
    fetch('/api/infrastructure/test-harness')
      .then(res => res.json())
      .then(data => setHarnessReport(data))
      .catch(console.error);
  };

  const launchTestHarness = () => {
    setShowHarnessMenu(false);
    setShowHarnessModal(true);
    fetch('/api/infrastructure/test-harness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...harnessConfig, projectId: projectId || 'core-edge-dm1', clusterName: clusterName || 'gdc-e2e-test-1' })
    }).then(() => fetchHarnessStatus());
  };


  useEffect(() => {
    fetchHarnessStatus();
  }, []);

  useEffect(() => {
    const isRunning = harnessReport && harnessReport.status === "running";
    if (showHarnessModal || isRunning) {
      const t = setInterval(fetchHarnessStatus, 1500);
      return () => clearInterval(t);
    }
  }, [showHarnessModal, harnessReport?.status]);

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
      {/* Fleet Operations Center */}
      <FleetOperationsCenter currentProject={projectId || 'gdc-edge-demo-1'} onNavigateTab={setActiveTab} />

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
      {/* E2E Test Suite Customization Menu & Alerting Hub */}
      {showHarnessMenu && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-purple-500/60 rounded-3xl p-6 max-w-xl w-full space-y-6 shadow-2xl overflow-hidden text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold text-xl">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-base font-black text-white">E2E Verification Suite Configuration</h3>
                  <p className="text-[11px] text-slate-400">Select execution phases and configure alerting</p>
                </div>
              </div>
              <button
                onClick={() => setShowHarnessMenu(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2.5 bg-slate-950/90 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">1. Select Execution Phases to Build & Test</h4>
                <div className="grid grid-cols-1 gap-2 text-slate-300">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runProvisioning} onChange={e => setHarnessConfig({...harnessConfig, runProvisioning: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 1:</strong> Provision Bare-Metal Cluster (bmctl & Terraform)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runVms} onChange={e => setHarnessConfig({...harnessConfig, runVms: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 2A:</strong> Ingest KubeVirt VMs & OS Templates (`ubuntu-22.04`, `rhel-9-sql`)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runWorkloads} onChange={e => setHarnessConfig({...harnessConfig, runWorkloads: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 2B:</strong> Deploy Containerized Workloads (`pos-engine`, `redis-cache`)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runBenchmarks} onChange={e => setHarnessConfig({...harnessConfig, runBenchmarks: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 3:</strong> Execute Performance & Database Stress Benchmarks</span>
                  </label>
                  {harnessConfig.runBenchmarks && (
                    <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px] text-purple-300 border-l border-purple-500/30 ml-2 py-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={harnessConfig.benchmarkFio} onChange={e => setHarnessConfig({...harnessConfig, benchmarkFio: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                        <span>fio NVMe IOPS Stress Suite</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={harnessConfig.benchmarkIperf} onChange={e => setHarnessConfig({...harnessConfig, benchmarkIperf: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                        <span>iperf3 VXLAN Fabric Load Test</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={harnessConfig.benchmarkMongo} onChange={e => setHarnessConfig({...harnessConfig, benchmarkMongo: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                        <span>MongoDB YCSB Transaction Benchmark</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={harnessConfig.benchmarkRedis} onChange={e => setHarnessConfig({...harnessConfig, benchmarkRedis: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                        <span>Redis In-Memory Caching Benchmark</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer col-span-1 md:col-span-2">
                        <input type="checkbox" checked={harnessConfig.benchmarkPg} onChange={e => setHarnessConfig({...harnessConfig, benchmarkPg: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                        <span>PostgreSQL pgbench OLTP Relational Stress Test</span>
                      </label>
                    </div>
                  )}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runSentinel} onChange={e => setHarnessConfig({...harnessConfig, runSentinel: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 4:</strong> Run AI Sentinel Watchdog Anomaly & Kernel Audit</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={harnessConfig.runTeardown} onChange={e => setHarnessConfig({...harnessConfig, runTeardown: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                    <span><strong>Phase 5:</strong> Clean Teardown & Decommission Cloud Resources</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2.5 bg-slate-950/90 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">2. Email Alerting & SLA Notification Hub</h4>
                <div className="space-y-2">
                  <label className="block text-slate-400 text-[11px]">Recipient Email Address for SLA Reports & Error Alerts</label>
                  <input
                    type="email"
                    value={harnessConfig.emailAlerts}
                    onChange={e => setHarnessConfig({...harnessConfig, emailAlerts: e.target.value})}
                    placeholder="e.g. devops-team@kroger.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500 transition"
                  />
                  <div className="flex items-center gap-4 pt-1 text-slate-300">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={harnessConfig.notifyOnSuccess} onChange={e => setHarnessConfig({...harnessConfig, notifyOnSuccess: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                      <span>Email SLA Summary on Completion</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={harnessConfig.notifyOnError} onChange={e => setHarnessConfig({...harnessConfig, notifyOnError: e.target.checked})} className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0" />
                      <span>Instant Alert on Execution Error</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowHarnessMenu(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={launchTestHarness}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black shadow-lg shadow-purple-500/20 transition flex items-center gap-2"
              >
                <span>🚀 Launch Custom Verification Suite</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated E2E Test Harness Modal */}
      {showHarnessModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-purple-500/60 rounded-3xl p-6 max-w-3xl w-full space-y-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold text-xl">
                  🚀
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Automated Full-Stack Lifecycle E2E Test Harness</h3>
                  <p className="text-xs text-slate-400">Deploy Cluster → Deploy VMs → Stress Benchmarks → AI Audit → Clean Teardown</p>
                </div>
              </div>
              <button
                onClick={() => setShowHarnessModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs font-mono">
              {harnessReport?.summary && (
                <div className={`p-4 rounded-xl border font-bold ${harnessReport.status === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : harnessReport.status === 'failed' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-sky-500/10 border-sky-500/30 text-sky-300 animate-pulse'}`}>
                  {harnessReport.summary}
                </div>
              )}

              <div className="space-y-3">
                {(harnessReport?.steps || []).map((s: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-white flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.status === 'running' ? 'bg-sky-400 animate-ping' : s.status === 'success' ? 'bg-emerald-400' : s.status === 'failed' ? 'bg-rose-500' : 'bg-slate-600'}`} />
                        {s.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${s.status === 'running' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : s.status === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : s.status === 'failed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-500'}`}>
                        {s.status === 'running' ? 'EXECUTING...' : s.status} {s.durationMs ? `(${Math.round(s.durationMs / 1000)}s)` : ''}
                      </span>
                    </div>
                    {s.details && <div className="text-[11px] text-slate-300">{s.details}</div>}
                    {s.logs && s.logs.length > 0 && (
                      <div className="bg-slate-900/80 p-2 rounded-lg text-[10px] text-slate-400 space-y-0.5 border border-slate-800/80">
                        {s.logs.map((l: string, lIdx: number) => <div key={lIdx}>• {l}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Target: <strong className="text-white">{harnessReport?.clusterName}</strong> ({harnessReport?.projectId})</span>
              {harnessReport?.status === 'success' && (
                <button
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(harnessReport, null, 2));
                    const dlAnchor = document.createElement('a');
                    dlAnchor.setAttribute("href", dataStr);
                    dlAnchor.setAttribute("download", `gdc-e2e-verification-report-${harnessReport.jobId}.json`);
                    dlAnchor.click();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md transition"
                >
                  📥 Download Verification SLA Report (.JSON)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
