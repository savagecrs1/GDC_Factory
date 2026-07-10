'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, Activity, Cpu, Server, Zap, RefreshCw, CheckCircle2, Clock, Lock, Layers, Network, Database, HardDrive, Sparkles, AlertCircle, Play, Gauge } from 'lucide-react';

interface PerformanceDashboardProps {
  clusterName: string;
  projectId?: string;
}

type BenchmarkProfile = 'pos_commerce' | 'sec_crypto' | 'topolvm_io' | 'vxlan_overlay' | 'mongo_perf';

export default function PerformanceDashboard({ clusterName, projectId }: PerformanceDashboardProps) {
  const [profile, setProfile] = useState<BenchmarkProfile>('pos_commerce');
  const [concurrency, setConcurrency] = useState<number>(12);
  const [durationSec, setDurationSec] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [benchResult, setBenchResult] = useState<any>(null);

  // Live streaming execution state
  const [execPhase, setExecPhase] = useState<'idle' | 'warmup' | 'stressing' | 'analyzing' | 'complete'>('idle');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const timerRef = useRef<any>(null);

  const handleRunBenchmark = async (targetProfile?: BenchmarkProfile, targetConcurrency?: number) => {
    const prof = targetProfile || profile;
    const conc = targetConcurrency || concurrency;
    setLoading(true);
    setExecPhase('warmup');
    setElapsedSec(0);
    if (timerRef.current) clearInterval(timerRef.current);

    // Simulate benchmark phases live
    let sec = 0;
    timerRef.current = setInterval(() => {
      sec += 1;
      setElapsedSec(sec);
      if (sec === 2) setExecPhase('stressing');
      if (sec === durationSec - 1) setExecPhase('analyzing');
      if (sec >= durationSec) {
        clearInterval(timerRef.current);
        setExecPhase('complete');
        generateBenchmarkTelemetry(prof, conc);
        setLoading(false);
      }
    }, 1000);
  };

  const generateBenchmarkTelemetry = (prof: BenchmarkProfile, conc: number) => {
    let p50 = 12.4, p95 = 28.6, p99 = 45.2, tps = 1850, readMb = 340, writeMb = 180, netMb = 45;
    let title = "POS Commerce Catalog Lookup & DB Transaction Bench";
    let desc = "Simulates concurrent SKU database lookups and itemized cart commits across VLAN 3130.";

    if (prof === 'sec_crypto') {
      p50 = 24.8; p95 = 48.2; p99 = 72.4; tps = 950; readMb = 80; writeMb = 40; netMb = 110;
      title = "Enterprise DUKPT Point-to-Point Encryption Bench";
      desc = "Stress-tests cryptographic AES-256 tokenization handshakes across isolated VLAN 200 overlay.";
    } else if (prof === 'topolvm_io') {
      p50 = 4.2; p95 = 11.8; p99 = 18.5; tps = 4200; readMb = 820; writeMb = 640; netMb = 20;
      title = "TopoLVM Local NVMe Block Persistent Volume I/O Bench";
      desc = "Measures Read/Write IOPs and sequential throughput on local Logical Volume Manager PVCs.";
    } else if (prof === 'vxlan_overlay') {
      p50 = 8.6; p95 = 19.4; p99 = 31.0; tps = 3100; readMb = 150; writeMb = 120; netMb = 480;
      title = "Multi-VLAN VXLAN Dual-Overlay Bandwidth Bench";
      desc = "Evaluates Multus secondary network interface throughput and 1410 MTU clamping packet efficiency.";
    } else if (prof === 'mongo_perf') {
      p50 = 6.8; p95 = 14.2; p99 = 22.1; tps = 5400; readMb = 620; writeMb = 510; netMb = 85;
      title = "Enterprise MongoDB TopoLVM Storage Bench";
      desc = "Deploys Enterprise MongoDB performance suite across TopoLVM RWO storage volumes to stress B-tree indexes and disk sync.";
    }

    // Scale slightly with concurrency
    const concMultiplier = conc / 12;
    p50 = Number((p50 * Math.pow(concMultiplier, 0.3)).toFixed(1));
    p95 = Number((p95 * Math.pow(concMultiplier, 0.4)).toFixed(1));
    p99 = Number((p99 * Math.pow(concMultiplier, 0.5)).toFixed(1));
    tps = Math.floor(tps * Math.pow(concMultiplier, 0.8));
    readMb = Math.floor(readMb * Math.pow(concMultiplier, 0.6));
    writeMb = Math.floor(writeMb * Math.pow(concMultiplier, 0.6));
    netMb = Math.floor(netMb * Math.pow(concMultiplier, 0.7));

    // Latency waterfall percentage breakdown
    const netPct = prof === 'vxlan_overlay' ? 45 : prof === 'sec_crypto' ? 35 : 15;
    const cpuPct = prof === 'sec_crypto' ? 45 : 25;
    const dbPct = prof === 'pos_commerce' ? 45 : 15;
    const ioPct = 100 - (netPct + cpuPct + dbPct);

    // Node telemetry
    const cpuLoad1 = Math.min(96, Math.floor(22 + (conc * 2.5) + Math.random() * 8));
    const cpuLoad2 = Math.min(92, Math.floor(18 + (conc * 2.2) + Math.random() * 6));
    const cpuLoad3 = Math.min(98, Math.floor(28 + (conc * 2.4) + Math.random() * 8));

    setBenchResult({
      profile: prof,
      title,
      desc,
      concurrency: conc,
      duration: durationSec,
      timestamp: new Date().toLocaleTimeString(),
      metrics: { p50, p95, p99, tps, readMb, writeMb, netMb },
      waterfall: { netPct, cpuPct, dbPct, ioPct },
      nodeMetrics: [
        {
          node: `${clusterName}-node-1`,
          role: "Primary Compute & Ingress Overlay",
          cpuUsage: `${cpuLoad1}%`,
          cpuCores: `${Math.floor(cpuLoad1 * 80)}m / 8000m`,
          memoryUsage: `${Math.min(85, Math.floor(26 + (conc * 1.5)))}%`,
          memoryBytes: `${(8.2 + (conc * 0.4)).toFixed(1)} GiB / 32 GiB`,
          diskIo: `${readMb} MB/s Read`,
          netIo: `${Math.floor(netMb * 0.4)} MB/s`,
          health: "100% Optimal"
        },
        {
          node: `${clusterName}-node-2`,
          role: "Secondary Worker & Cryptographic Gateway",
          cpuUsage: `${cpuLoad2}%`,
          cpuCores: `${Math.floor(cpuLoad2 * 80)}m / 8000m`,
          memoryUsage: `${Math.min(80, Math.floor(22 + (conc * 1.2)))}%`,
          memoryBytes: `${(7.0 + (conc * 0.35)).toFixed(1)} GiB / 32 GiB`,
          diskIo: `${writeMb} MB/s Write`,
          netIo: `${Math.floor(netMb * 0.35)} MB/s`,
          health: "100% Optimal"
        },
        {
          node: `${clusterName}-node-3`,
          role: "TopoLVM Persistent Block Storage Node",
          cpuUsage: `${cpuLoad3}%`,
          cpuCores: `${Math.floor(cpuLoad3 * 80)}m / 8000m`,
          memoryUsage: `${Math.min(90, Math.floor(38 + (conc * 1.1)))}%`,
          memoryBytes: `${(12.1 + (conc * 0.3)).toFixed(1)} GiB / 32 GiB`,
          diskIo: `${readMb + writeMb} MB/s Total`,
          netIo: `${Math.floor(netMb * 0.25)} MB/s`,
          health: "100% Optimal"
        }
      ]
    });
  };

  useEffect(() => {
    // Initial default telemetry load
    generateBenchmarkTelemetry('pos_commerce', 12);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/30 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
              <Gauge className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                GDC Bare-Metal Performance & Telemetry Analyzer
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono font-normal">
                  Real-Time Benchmarking
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Stress-test workload throughput, evaluate NVMe block storage IOPs, and analyze network overlay latency across bare-metal nodes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Target: <strong className="text-white">{clusterName}</strong> ({projectId || 'gdc-edge-demo-1'})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Benchmark Profile & Load Configuration (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                Benchmark Profile & Load Scaling
              </h3>
              <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20 font-mono">
                Workload Profiler
              </span>
            </div>

            <div className="space-y-4">
              {/* Profile Selection */}
              <div>
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2.5">
                  Select Performance Suite:
                </span>
                <div className="space-y-2">
                  {[
                    { id: 'pos_commerce', label: '🚀 POS Commerce Catalog & DB Bench', desc: 'Simulates SKU database lookups & basket transactions over VLAN 3130', icon: Database, color: 'text-sky-400 border-sky-500/40 bg-sky-950/20' },
                    { id: 'sec_crypto', label: '🔒 Enterprise DUKPT Encryption Bench', desc: 'Stress-tests cryptographic tokenization across isolated VLAN 200', icon: Lock, color: 'text-amber-400 border-amber-500/40 bg-amber-950/20' },
                    { id: 'topolvm_io', label: '💾 TopoLVM Local NVMe Block I/O Test', desc: 'Measures RWO PVC sequential throughput & IOPS on logical volume group', icon: HardDrive, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20' },
                    { id: 'vxlan_overlay', label: '🌐 Multi-VLAN VXLAN Overlay Throughput', desc: 'Evaluates Multus secondary network interface bandwidth & MTU efficiency', icon: Network, color: 'text-indigo-400 border-indigo-500/40 bg-indigo-950/20' },
                    { id: 'mongo_perf', label: '🍃 Enterprise MongoDB TopoLVM Bench', desc: 'Deploys MongoDB performance suite across TopoLVM RWO storage volumes', icon: Database, color: 'text-teal-400 border-teal-500/40 bg-teal-950/20' }
                  ].map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProfile(p.id); handleRunBenchmark(p.id, concurrency); }}
                      disabled={loading}
                      className={`w-full p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                        profile === p.id
                          ? `${p.color} shadow-lg font-bold`
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <p.icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">{p.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-normal leading-snug">{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Concurrency Scaling Slider */}
              <div className="pt-3 border-t border-slate-800/80">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-400" /> Concurrent Workers / Pods
                  </label>
                  <span className="text-sm font-bold font-mono text-sky-400 bg-sky-950/50 border border-sky-500/30 px-3 py-1 rounded-lg">
                    {concurrency} Workers
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="32"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  disabled={loading}
                  className="w-full accent-sky-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[
                    { label: 'Single (1)', val: 1 },
                    { label: 'Standard (12)', val: 12 },
                    { label: 'Heavy (24)', val: 24 },
                    { label: 'Max Peak (32)', val: 32 }
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => { setConcurrency(btn.val); handleRunBenchmark(profile, btn.val); }}
                      disabled={loading}
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-semibold border transition ${
                        concurrency === btn.val
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRunBenchmark()}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-emerald-600 hover:from-sky-400 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition mt-4"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                <span>Execute Performance Benchmark Suite</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed font-mono">
              <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Live Execution Progress
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Status: <strong className="text-sky-300 uppercase">{execPhase}</strong></span>
                {loading && <span className="text-slate-400">[{elapsedSec}s / {durationSec}s]</span>}
              </div>
              {loading && (
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1">
                  <div className="bg-gradient-to-r from-sky-400 to-emerald-400 h-full rounded-full transition-all duration-300" style={{ width: `${(elapsedSec / durationSec) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: KPIs, Latency Waterfall, and Node Telemetry (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* KPI Gauges Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                Real-Time Benchmark Telemetry ({benchResult?.concurrency || concurrency} Worker Threads)
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                {benchResult?.timestamp || 'Live Data'}
              </span>
            </div>

            {benchResult?.metrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-sky-400" /> AVG LATENCY (P50)
                  </span>
                  <span className="text-xl font-bold font-mono text-white block">{benchResult.metrics.p50} ms</span>
                  <span className="text-[10px] text-emerald-400 block font-mono">P95: {benchResult.metrics.p95} ms</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-rose-400" /> TAIL LATENCY (P99)
                  </span>
                  <span className="text-xl font-bold font-mono text-rose-400 block">{benchResult.metrics.p99} ms</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Max Peak Deviation</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Zap className="w-3 h-3 text-indigo-400" /> SYSTEM THROUGHPUT
                  </span>
                  <span className="text-xl font-bold font-mono text-indigo-300 block">{benchResult.metrics.tps} OPS</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Transactions / Sec</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-emerald-400" /> DISK & NET I/O
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-400 block">{benchResult.metrics.readMb + benchResult.metrics.writeMb} MB/s</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Net: {benchResult.metrics.netMb} MB/s</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/60 font-mono text-xs">
                Select a benchmark profile on the left to execute latency and throughput analysis.
              </div>
            )}
          </div>

          {/* Granular Latency Waterfall Breakdown Card */}
          {benchResult?.waterfall && (
            <div className="glass-panel p-6 rounded-2xl border border-sky-500/40 bg-sky-950/10 space-y-4 font-mono text-xs animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Latency Attribution & Performance Bottleneck Analyzer
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Granular execution breakdown for <strong className="text-white">{benchResult.title}</strong>
                  </span>
                </div>
              </div>

              {/* 4-Stage Waterfall Bars */}
              <div className="space-y-3 pt-1">
                {/* Stage 1 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      1. Network Overlay Encapsulation (VXLAN / Multus CNI)
                    </span>
                    <span className="text-sky-400 font-bold">{benchResult.waterfall.netPct}% Attribution</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-sky-400 h-full rounded-full transition-all duration-500" style={{ width: `${benchResult.waterfall.netPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">VLAN encapsulation overhead and packet routing delay</span>
                </div>

                {/* Stage 2 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      2. Compute & Cryptographic Processing (CPU Threads)
                    </span>
                    <span className="text-amber-400 font-bold">{benchResult.waterfall.cpuPct}% Attribution</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full rounded-full transition-all duration-500" style={{ width: `${benchResult.waterfall.cpuPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">CPU time spent in DUKPT AES-256 crypto handshakes and rules evaluation</span>
                </div>

                {/* Stage 3 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      3. Database Query & Memory Cache Lookup
                    </span>
                    <span className="text-indigo-400 font-bold">{benchResult.waterfall.dbPct}% Attribution</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${benchResult.waterfall.dbPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">In-memory item catalog search and transaction state read</span>
                </div>

                {/* Stage 4 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      4. Storage Block Commit I/O (TopoLVM RWO)
                    </span>
                    <span className="text-emerald-400 font-bold">{benchResult.waterfall.ioPct}% Attribution</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${benchResult.waterfall.ioPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">Persistent volume claim write synchronization to local NVMe disk</span>
                </div>
              </div>

              {/* AI Bottleneck Diagnosis Box */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-sky-500/30 flex items-start gap-3 mt-3">
                <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-slate-300">
                  <span className="text-white font-bold block text-xs">🤖 Automated Edge Engineering Diagnosis</span>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {benchResult.waterfall.netPct > 40
                      ? `⚠️ Network Overlay Bottleneck Detected (${benchResult.waterfall.netPct}%): VXLAN packet encapsulation is consuming significant latency. Verify 1410 MTU clamping is active across secondary VLAN interfaces.`
                      : benchResult.waterfall.cpuPct > 40
                      ? `💡 CPU Cryptographic Saturation (${benchResult.waterfall.cpuPct}%): High concurrency is stressing AES tokenization threads. Consider pinning DUKPT gateway pods to dedicated CPU cores using CPU Manager.`
                      : `✅ Balanced Edge Execution: Infrastructure throughput and storage IOPs are operating within optimal QSA bare-metal benchmarks.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Node & Process Telemetry Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Physical Bare-Metal Node Resource Telemetry
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                3 Physical Hosts
              </span>
            </div>

            <div className="space-y-3">
              {(benchResult?.nodeMetrics || []).map((nm: any) => (
                <div key={nm.node} className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 font-mono text-xs transition hover:border-slate-700">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white">{nm.node}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">{nm.role}</span>
                    </div>
                    <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {nm.health}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[10px]">
                        <span>CPU UTIL</span>
                        <span className="text-white font-bold">{nm.cpuUsage}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-sky-400 to-indigo-500 h-full rounded-full" style={{ width: nm.cpuUsage }} />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{nm.cpuCores}</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[10px]">
                        <span>MEMORY UTIL</span>
                        <span className="text-white font-bold">{nm.memoryUsage}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full" style={{ width: nm.memoryUsage }} />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{nm.memoryBytes}</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[10px]">
                        <span>DISK I/O</span>
                        <span className="text-amber-300 font-bold">{nm.diskIo.split(' ')[0]}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full" style={{ width: "60%" }} />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{nm.diskIo}</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[10px]">
                        <span>NET I/O</span>
                        <span className="text-indigo-300 font-bold">{nm.netIo.split(' ')[0]}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-400 to-purple-500 h-full rounded-full" style={{ width: "50%" }} />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{nm.netIo}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
