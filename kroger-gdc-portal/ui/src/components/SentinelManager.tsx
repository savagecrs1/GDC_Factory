'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bot, Play, Square, RefreshCw, AlertTriangle, CheckCircle, Zap, ShieldAlert, Terminal, Sparkles, ArrowRight, Layers } from 'lucide-react';

interface SentinelManagerProps {
  clusterName: string;
  projectId?: string;
}

export default function SentinelManager({ clusterName: initialCluster, projectId: initialProject }: SentinelManagerProps) {
  const [activeLoops, setActiveLoops] = useState<Record<string, any>>({});
  const [triageReports, setTriageReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingFix, setExecutingFix] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Form inputs
  const [projectId, setProjectId] = useState(initialProject || 'kroger-store-test1');
  const [clusterName, setClusterName] = useState(initialCluster || 'kroger-store-001');

  useEffect(() => {
    if (initialProject) setProjectId(initialProject);
  }, [initialProject]);

  useEffect(() => {
    if (initialCluster) setClusterName(initialCluster);
  }, [initialCluster]);

  const [iterations, setIterations] = useState(5);
  const [billingAccountId, setBillingAccountId] = useState('0150AE-F3AB84-9BC087');
  const [availableProjects, setAvailableProjects] = useState<any[]>([
    { id: 'kroger-store-test1', name: 'Kroger Store Test 1' },
    { id: 'vdc-18818', name: 'GDC Demo VDC 18818' },
    { id: 'core-edge-dm1', name: 'Core Edge DM1 (Admin WS)' },
  ]);

  useEffect(() => {
    fetch('/api/gcp/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && data.projects.length > 0) {
          setAvailableProjects(data.projects);
        }
      })
      .catch(console.error);
  }, []);

  const currentLoopId = `${projectId}-${clusterName}`;
  const currentLoopState = activeLoops[currentLoopId] || {
    isRunning: false,
    activePhase: 'idle',
    currentIteration: 0,
    maxIterations: iterations,
    targetProject: projectId,
    targetCluster: clusterName,
    logs: [`[Sentinel AI Engine] System initialized for ${clusterName} in ${projectId}. Ready for concurrent execution.`],
  };

  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/sentinel/status?projectId=${encodeURIComponent(projectId)}&clusterName=${encodeURIComponent(clusterName)}`);
      const data = await res.json();
      if (res.ok) {
        if (data.activeLoops) setActiveLoops(data.activeLoops);
        if (data.triageReports) setTriageReports(data.triageReports);
      }
    } catch (err) {
      console.error('Error fetching Sentinel status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [projectId, clusterName]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentLoopState.logs]);

  const handleStartLoop = async () => {
    await fetch('/api/sentinel/loop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', projectId, clusterName, iterations, billingAccountId }),
    });
    fetchStatus();
  };

  const handleStopLoop = async () => {
    await fetch('/api/sentinel/loop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', projectId, clusterName }),
    });
    fetchStatus();
  };

  const handleClearLoop = async (targetProj: string, targetClust: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/sentinel/loop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', projectId: targetProj, clusterName: targetClust }),
    });
    fetchStatus();
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
      const data = await res.json();
      setFixResult({ id, success: res.ok, message: data.message || data.error });
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

  const handleClearTriage = async () => {
    try {
      const res = await fetch('/api/sentinel/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.ok) {
        setTriageReports([]);
      }
    } catch (err) {
      console.error('Error clearing triage reports:', err);
    }
  };

  const activeLoopCount = Object.values(activeLoops).filter((l: any) => l.isRunning).length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-sky-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">GDC Sentinel Multi-Project Concurrent Test Engine</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                {activeLoopCount} Active Loops
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Run asynchronous, non-blocking CI/CD chaos validation loops across multiple GCP projects simultaneously.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Concurrent Loops Overview Bar */}
      {Object.keys(activeLoops).length > 0 && (
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Active Project Loops:
          </span>
          {Object.values(activeLoops).map((loop: any) => (
            <button
              key={loop.loopId}
              onClick={() => {
                setProjectId(loop.targetProject);
                setClusterName(loop.targetCluster);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition flex items-center gap-2 ${
                currentLoopId === loop.loopId
                  ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${loop.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <span>{loop.targetProject}</span>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">[{loop.currentIteration}/{loop.maxIterations}]</span>
              {!loop.isRunning && (
                <span
                  onClick={(e) => handleClearLoop(loop.targetProject, loop.targetCluster, e)}
                  className="ml-1 px-1 rounded hover:bg-rose-500/30 text-slate-500 hover:text-rose-400 font-bold transition"
                  title="Remove loop from history"
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Continuous Lifecycle Loop Controller (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Play className="w-4 h-4 text-sky-400" />
                Concurrent Loop Controller
              </h3>
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold ${
                currentLoopState.isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse' : 'bg-slate-800 text-slate-400'
              }`}>
                {currentLoopState.isRunning ? `RUNNING [Iter ${currentLoopState.currentIteration}/${currentLoopState.maxIterations}]` : 'IDLE / STOPPED'}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Target GCP Project ID
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={currentLoopState.isRunning}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                >
                  {availableProjects.map((p, idx) => (
                    <option key={`${p.id || 'proj'}-${idx}`} value={p.id}>
                      {p.name ? `${p.name} (${p.id})` : p.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Test Cluster Name
                </label>
                <input
                  type="text"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  disabled={currentLoopState.isRunning}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Test Loop Iterations
                  </label>
                  <select
                    value={iterations}
                    onChange={(e) => setIterations(Number(e.target.value))}
                    disabled={currentLoopState.isRunning}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition"
                  >
                    <option value={1}>1 Iteration (Single Test)</option>
                    <option value={3}>3 Iterations (Stress Test)</option>
                    <option value={5}>5 Iterations (Endurance)</option>
                    <option value={10}>10 Iterations (Overnight Chaos)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Billing Account ID
                  </label>
                  <input
                    type="text"
                    value={billingAccountId}
                    onChange={(e) => setBillingAccountId(e.target.value)}
                    disabled={currentLoopState.isRunning}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                {!currentLoopState.isRunning ? (
                  <button
                    onClick={handleStartLoop}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Launch Concurrent Loop</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStopLoop}
                    className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 font-semibold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Square className="w-4 h-4 fill-rose-400" />
                    <span>Stop Loop on {projectId}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: AI Watchdog Triage Feed & Live Console (Col 7) */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          {/* AI Watchdog RCA Cards */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex-1 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-md">AI Watchdog Root Cause Analysis (RCA) Hub</h3>
              </div>
              <div className="flex items-center gap-2">
                {(triageReports || []).length > 0 && (
                  <button
                    onClick={handleClearTriage}
                    className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-md font-mono transition"
                  >
                    Clear Reports
                  </button>
                )}
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                  {(triageReports || []).length} Triage Alerts
                </span>
              </div>
            </div>

            {(triageReports || []).length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                <CheckCircle className="w-10 h-10 text-emerald-500/40" />
                <p className="text-sm font-medium text-slate-400">No active triage alerts detected</p>
                <p className="text-xs text-slate-500">When an automation or test failure occurs, GDC Sentinel will automatically generate root cause reports here.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(triageReports || []).map((report: any) => {
                  const isRemediated = report.status === 'remediated';
                  const isIgnored = report.status === 'ignored';
                  if (isIgnored) return null;

                  return (
                    <div key={report.id} className={`p-4 rounded-xl border transition ${
                      isRemediated
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : report.severity === 'critical' || report.severity === 'high'
                        ? 'bg-rose-500/10 border-rose-500/40 shadow-lg shadow-rose-500/5'
                        : 'bg-slate-900/80 border-slate-700'
                    }`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            report.severity === 'critical' ? 'bg-rose-500 text-white' :
                            report.severity === 'high' ? 'bg-amber-500 text-slate-950' : 'bg-sky-500 text-slate-950'
                          }`}>
                            {report.severity}
                          </span>
                          <h4 className="font-bold text-white text-sm">{report.errorTitle}</h4>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{new Date(report.timestamp).toLocaleTimeString()}</span>
                      </div>

                      <div className="text-xs text-slate-300 space-y-2">
                        <p className="leading-relaxed"><strong className="text-rose-300">Root Cause:</strong> {report.rootCause}</p>
                        <p className="leading-relaxed"><strong className="text-sky-300">Suggested Action:</strong> {report.remediationStep}</p>
                      </div>

                      {report.autoFixAvailable && !isRemediated && (
                        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3">
                          <code className="text-[10px] font-mono bg-slate-950 px-2 py-1 rounded text-slate-400 truncate max-w-[280px]">
                            {report.autoFixCommand}
                          </code>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleIgnoreReport(report.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] transition"
                            >
                              Ignore
                            </button>
                            <button
                              onClick={() => handleExecuteFix(report.id)}
                              disabled={executingFix === report.id}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition"
                            >
                              {executingFix === report.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-white" />}
                              <span>Execute AI Auto-Remediate</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {isRemediated && (
                        <div className="mt-3 pt-2 border-t border-emerald-500/20 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                          <CheckCircle className="w-4 h-4" />
                          <span>AI Auto-Remediation executed successfully!</span>
                        </div>
                      )}

                      {fixResult && fixResult.id === report.id && (
                        <div className={`mt-2 p-2 rounded text-[11px] font-mono ${fixResult.success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                          {fixResult.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sentinel Live Console Output */}
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                Sentinel Execution Stream ({projectId})
              </span>
              <span className="text-[10px] text-slate-500">Buffer: {(currentLoopState.logs || []).length} lines</span>
            </div>
            <div className="terminal-window p-4 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1">
              {(currentLoopState.logs || []).map((log: string, idx: number) => (
                <div key={idx} className={`leading-relaxed ${log.includes('❌') ? 'text-rose-400 font-semibold' : log.includes('✅') ? 'text-emerald-400 font-semibold' : log.includes('🚀') ? 'text-sky-300 font-bold' : 'text-slate-300'}`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
