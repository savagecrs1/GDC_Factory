'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, ShieldCheck, Activity, Cpu, Server, Zap, RefreshCw, CheckCircle2, Clock, Lock, Users, CreditCard, Play, Sparkles, AlertCircle, BarChart3, ArrowRight } from 'lucide-react';

interface RetailTestDashboardProps {
  clusterName: string;
  projectId?: string;
}

export default function RetailTestDashboard({ clusterName, projectId }: RetailTestDashboardProps) {
  const [itemCount, setItemCount] = useState<number>(12);
  const [laneCount, setLaneCount] = useState<number>(6);
  const [simSpeed, setSimSpeed] = useState<'1x' | '3x' | 'instant'>('3x');
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [streamPhase, setStreamPhase] = useState<'idle' | 'scanning' | 'reconciling' | 'tokenizing' | 'tendered'>('idle');
  const [scannedCount, setScannedCount] = useState<number>(0);
  const timerRef = useRef<any>(null);

  const handleRunCheckout = async (itemsToRun?: number, lanesToRun?: number) => {
    const targetItems = itemsToRun || itemCount;
    const targetLanes = lanesToRun || laneCount;
    setLoading(true);
    setStreamPhase('idle');
    setScannedCount(0);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const res = await fetch('/api/kubernetes/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, projectId, itemCount: targetItems, laneCount: targetLanes }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        setSelectedLaneIndex(0);

        if (simSpeed === 'instant') {
          setScannedCount(targetItems);
          setStreamPhase('tendered');
        } else {
          startStreamingLifecycle(data.lanes[0]?.item_count || targetItems);
        }
      }
    } catch (err) {
      console.error('Error running multi-lane retail checkout:', err);
    } finally {
      setLoading(false);
    }
  };

  const startStreamingLifecycle = (maxItems: number) => {
    setStreamPhase('scanning');
    let current = 0;
    const intervalMs = simSpeed === '1x' ? 450 : 120;

    timerRef.current = setInterval(() => {
      current += 1;
      setScannedCount(current);
      if (current >= maxItems) {
        clearInterval(timerRef.current);
        setStreamPhase('reconciling');
        setTimeout(() => {
          setStreamPhase('tokenizing');
          setTimeout(() => {
            setStreamPhase('tendered');
          }, simSpeed === '1x' ? 1200 : 400);
        }, simSpeed === '1x' ? 800 : 250);
      }
    }, intervalMs);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const selectedLane = testResult?.lanes?.[selectedLaneIndex] || testResult?.lanes?.[0];
  const visibleItems = selectedLane ? selectedLane.lifecycle_stream.slice(0, streamPhase === 'tendered' ? selectedLane.item_count : scannedCount) : [];

  // Latency percentages calculation for waterfall breakdown
  const timings = selectedLane?.timings || { total_e2e_ms: 1000, upc_scan_total_ms: 600, promo_reconcile_ms: 150, dukpt_tokenization_ms: 150, tender_closeout_ms: 100 };
  const scanPct = Math.round((timings.upc_scan_total_ms / timings.total_e2e_ms) * 100) || 60;
  const promoPct = Math.round((timings.promo_reconcile_ms / timings.total_e2e_ms) * 100) || 15;
  const dukptPct = Math.round((timings.dukpt_tokenization_ms / timings.total_e2e_ms) * 100) || 15;
  const tenderPct = Math.round((timings.tender_closeout_ms / timings.total_e2e_ms) * 100) || 10;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-400">
              <ShoppingCart className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Kroger Retail Edge Sandbox & Performance Diagnostics
                <span className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2.5 py-0.5 rounded-full font-mono font-normal">
                  VLAN 3130 ↔ VLAN 3430
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Pinpoint exact stream latency bottlenecks across database lookups, promotional rule matching, and network encryption overlays.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Scope: <strong className="text-white">{clusterName}</strong> ({projectId || 'kroger-test-2'})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cashier & Multi-Lane Controls (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Store Concurrency & Pace Controls
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                Multi-Lane Scaling
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <span className="text-[11px] text-slate-400 block mb-2 font-medium">Cashier Scanning Pace:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '1x', label: '⚡ 1x Cashier Pace', desc: 'Life-like ~450ms scan' },
                    { id: '3x', label: '⏩ 3x Fast-Forward', desc: 'Accelerated ~120ms' },
                    { id: 'instant', label: '🚀 Instant Peak', desc: '0ms benchmark' }
                  ].map((spd: any) => (
                    <button
                      key={spd.id}
                      type="button"
                      onClick={() => setSimSpeed(spd.id)}
                      disabled={loading}
                      className={`p-2 rounded-xl text-left border transition flex flex-col justify-between ${
                        simSpeed === spd.id
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-bold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs">{spd.label}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 font-normal">{spd.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-sky-400" /> Active Store Lanes (1 - 24 Lanes)
                  </label>
                  <span className="text-sm font-bold font-mono text-sky-400 bg-sky-950/50 border border-sky-500/30 px-3 py-1 rounded-lg">
                    {laneCount} Active Lanes
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={laneCount}
                  onChange={(e) => setLaneCount(Number(e.target.value))}
                  disabled={loading}
                  className="w-full accent-sky-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[
                    { label: 'Single (1)', count: 1 },
                    { label: 'Front End (6)', count: 6 },
                    { label: 'Superstore (16)', count: 16 },
                    { label: 'Max Peak (24)', count: 24 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setLaneCount(p.count); handleRunCheckout(itemCount, p.count); }}
                      disabled={loading}
                      className={`py-1.5 px-1 rounded-xl text-[10px] font-semibold border transition ${
                        laneCount === p.count
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" /> Avg Basket Size (1 - 50 items)
                  </label>
                  <span className="text-sm font-bold font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-lg">
                    ~{itemCount} Groceries
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={itemCount}
                  onChange={(e) => setItemCount(Number(e.target.value))}
                  disabled={loading}
                  className="w-full accent-emerald-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'Express (~3)', count: 3 },
                    { label: 'Standard (~12)', count: 12 },
                    { label: 'Stockup (~35)', count: 35 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setItemCount(p.count); handleRunCheckout(p.count, laneCount); }}
                      disabled={loading}
                      className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition ${
                        itemCount === p.count
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRunCheckout()}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition mt-4"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                <span>Start {laneCount}-Lane Live Checkout Stream ({simSpeed})</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed font-mono">
              <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                Performance Attribution
              </div>
              <p>
                • <strong className="text-white">DB Lookup</strong>: Governed by TopoLVM Read IOPs & DB Cache.
              </p>
              <p>
                • <strong className="text-white">Promo Reconciler</strong>: Governed by Node CPU compute threads.
              </p>
              <p>
                • <strong className="text-white">VLAN Handshake</strong>: Governed by Multus VXLAN encapsulation.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Multi-Lane Grid, Waterfall Latency Breakdown, and Receipt (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Aggregate Store Concurrency Metrics Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                Aggregate Store Throughput & Latency Telemetry
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                {testResult?.metrics ? `${testResult.metrics.totalLanes} Lanes Active` : 'Real-Time Telemetry'}
              </span>
            </div>

            {testResult?.metrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-sky-400" /> AVG E2E TIME
                  </span>
                  <span className="text-xl font-bold font-mono text-white block">{testResult.metrics.avgE2eMs} ms</span>
                  <span className="text-[10px] text-emerald-400 block font-mono">P95: {testResult.metrics.p95E2eMs} ms</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <ShoppingCart className="w-3 h-3 text-emerald-400" /> ITEMS SCANNED
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-400 block">{testResult.metrics.totalItemsScanned}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Across {testResult.metrics.totalLanes} lanes</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> PROMO SAVINGS
                  </span>
                  <span className="text-xl font-bold font-mono text-amber-400 block">{testResult.metrics.totalPromoSavings}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Kroger Plus Applied</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Zap className="w-3 h-3 text-indigo-400" /> STORE THROUGHPUT
                  </span>
                  <span className="text-xl font-bold font-mono text-indigo-300 block">{testResult.metrics.tpsRate} TPS</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Total Paid: {testResult.metrics.totalRevenue}</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/60 font-mono text-xs">
                Select pace and click start on the left to watch live cashier scanning and promotion reconciliation.
              </div>
            )}
          </div>

          {/* Granular Stream Latency Waterfall Breakdown Card */}
          {selectedLane && (
            <div className="glass-panel p-6 rounded-2xl border border-sky-500/40 bg-sky-950/10 space-y-4 font-mono text-xs animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-sky-400 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Stream Latency Attribution & Bottleneck Analyzer
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Granular timing breakdown for <strong className="text-white">{selectedLane.lane_name}</strong> ({selectedLane.item_count} items scanned)
                  </span>
                </div>
                <div className="bg-sky-500/20 px-3 py-1.5 rounded-xl border border-sky-500/30 text-right">
                  <span className="text-[10px] text-slate-400 block">TOTAL CHECKOUT TIME</span>
                  <span className="text-base font-bold text-white">{timings.total_e2e_ms} ms</span>
                </div>
              </div>

              {/* 4-Stage Waterfall Bars */}
              <div className="space-y-3 pt-1">
                {/* Stage 1 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      1. UPC Item Lookup & DB Query (TopoLVM IOPs)
                    </span>
                    <span className="text-sky-400 font-bold">{timings.upc_scan_total_ms} ms ({scanPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-sky-400 h-full rounded-full transition-all duration-500" style={{ width: `${scanPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">Average {(timings.upc_scan_total_ms / selectedLane.item_count).toFixed(1)} ms per item barcode lookup</span>
                </div>

                {/* Stage 2 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      2. Promotional Engine Reconciler (CPU Rules Matching)
                    </span>
                    <span className="text-amber-400 font-bold">{timings.promo_reconcile_ms} ms ({promoPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full rounded-full transition-all duration-500" style={{ width: `${promoPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">Evaluated Kroger Plus card & {selectedLane.promotions.length} active coupons</span>
                </div>

                {/* Stage 3 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      3. VLAN 3430 Cross-Overlay Network Handshake (Multus VXLAN)
                    </span>
                    <span className="text-indigo-400 font-bold">{timings.dukpt_tokenization_ms} ms ({dukptPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${dukptPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">DUKPT AES-256 cryptographic token exchange over network boundary</span>
                </div>

                {/* Stage 4 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      4. Receipt Tender & DB Inventory Closeout
                    </span>
                    <span className="text-emerald-400 font-bold">{timings.tender_closeout_ms} ms ({tenderPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${tenderPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">Finalized electronic signature and committed transaction audit log</span>
                </div>
              </div>

              {/* AI Bottleneck Diagnosis Box */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-sky-500/30 flex items-start gap-3 mt-3">
                <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-slate-300">
                  <span className="text-white font-bold block text-xs">🤖 Edge Engineering Performance Diagnosis</span>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {scanPct > 65
                      ? `💡 Item scanning dominates total checkout time (${scanPct}%). TopoLVM NVMe storage IOPs are optimal; overall speed scales linearly with cashier basket size.`
                      : dukptPct > 35
                      ? `⚠️ Cross-VLAN PIN pad encryption handshake is experiencing overlay queuing (${timings.dukpt_tokenization_ms}ms). Verify Multus VXLAN MTU clamping (1410) on bare-metal nodes.`
                      : `✅ Balanced execution stream across DB lookups, CPU rules matching, and network overlays. Store architecture supports sub-second payment SLAs.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Lane Live Grid Selector */}
          {testResult?.lanes && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-md flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Active Store Register Lanes (Click to Inspect Stream)
                </h3>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-500/30 font-mono font-bold">
                  {testResult.lanes.length} Lanes Online
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-52 overflow-y-auto pr-1">
                {testResult.lanes.map((lane: any, idx: number) => (
                  <button
                    key={lane.lane_id}
                    type="button"
                    onClick={() => setSelectedLaneIndex(idx)}
                    className={`p-2.5 rounded-xl border text-left font-mono transition flex flex-col justify-between ${
                      selectedLaneIndex === idx
                        ? 'bg-sky-500/20 border-sky-500 text-white shadow-lg shadow-sky-500/10'
                        : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-bold text-xs">{lane.lane_id}</span>
                      <span className={`w-2 h-2 rounded-full ${streamPhase === 'tendered' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate block mt-1">{lane.lane_type}</span>
                    <div className="flex justify-between items-center mt-2 pt-1 border-t border-slate-800/80 text-[10px]">
                      <span className="text-emerald-400 font-bold">{streamPhase === 'tendered' ? lane.receipt.total_paid : 'Scanning...'}</span>
                      <span className="text-slate-400">{lane.timings.total_e2e_ms}ms</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live Streaming Itemized Receipt & Lifecycle Progress */}
          {selectedLane && (
            <div className="glass-panel p-6 rounded-2xl border border-emerald-500/40 bg-emerald-950/10 space-y-4 font-mono text-xs animate-fadeIn">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {streamPhase === 'scanning' && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />}
                  {streamPhase === 'reconciling' && <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />}
                  {streamPhase === 'tokenizing' && <Lock className="w-4 h-4 text-indigo-400 animate-pulse" />}
                  {streamPhase === 'tendered' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">ACTIVE LIFECYCLE PHASE</span>
                    <span className="text-white font-bold">
                      {streamPhase === 'scanning' && `🔍 CASHIER SCANNING ITEMS (${visibleItems.length}/${selectedLane.item_count})...`}
                      {streamPhase === 'reconciling' && `🏷️ RECONCILING PROMOTIONS & PLUS CARD DISCOUNTS...`}
                      {streamPhase === 'tokenizing' && `💳 DUKPT POINT-TO-POINT PIN PAD AUTHORIZATION...`}
                      {streamPhase === 'tendered' && `✅ BASKET TENDERED & RECEIPT FINALIZED`}
                    </span>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold text-sm bg-emerald-950/80 px-3 py-1 rounded border border-emerald-500/30">
                  {streamPhase === 'tendered' ? selectedLane.receipt.total_paid : `$${(visibleItems.reduce((acc: number, i: any) => acc + parseFloat(i.unit_price.replace('$','')), 0)).toFixed(2)}`}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-slate-800 pb-2 text-emerald-400 font-bold text-sm">
                <span>RECEIPT STREAM: {selectedLane.lane_name}</span>
                <span className="text-xs text-slate-400">TX: {selectedLane.receipt.transaction_id}</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 py-2 border-b border-slate-800/80 text-slate-300 pr-1">
                {visibleItems.map((item: any, idx: number) => (
                  <div key={idx} className="p-2 rounded bg-slate-950/80 border border-slate-900 flex flex-col gap-1 transition animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span>
                        <span className="text-slate-500 font-mono text-[10px] mr-2">[{String(item.sequence).padStart(2, '0')}] UPC {item.upc}</span>
                        <strong className="text-white">{item.name}</strong>
                      </span>
                      <span className="font-bold text-white">{item.unit_price}</span>
                    </div>
                    {item.promo && (
                      <div className="flex justify-between items-center text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        <span>🏷️ PROMO: {item.promo.description}</span>
                        <span className="font-bold">SAVED {item.promo.discount}</span>
                      </div>
                    )}
                  </div>
                ))}
                {streamPhase === 'scanning' && (
                  <div className="text-center py-2 text-slate-500 animate-pulse text-[11px]">
                    ... Cashier picking up next grocery item from conveyor belt ...
                  </div>
                )}
              </div>

              {streamPhase !== 'scanning' ? (
                <div className="space-y-1 pt-1 animate-fadeIn">
                  <div className="flex justify-between items-center text-slate-300 text-xs">
                    <span>RAW SUBTOTAL:</span>
                    <span>{selectedLane.receipt.raw_subtotal}</span>
                  </div>
                  <div className="flex justify-between items-center text-amber-400 text-xs">
                    <span>PROMOTIONAL SAVINGS:</span>
                    <span className="font-bold">{selectedLane.receipt.promo_savings}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300 text-sm font-bold pt-1 border-t border-slate-800/80">
                    <span>NET SUBTOTAL ({selectedLane.item_count} items):</span>
                    <span>{selectedLane.receipt.net_subtotal}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 text-xs">
                    <span>ESTIMATED TAX (7%):</span>
                    <span>{selectedLane.receipt.tax}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-emerald-400 text-base font-bold">
                    <span>TOTAL TENDERED:</span>
                    <span>{selectedLane.receipt.total_paid}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-slate-500 text-xs font-mono">
                  Promotions and sales tax will be reconciled at basket closeout...
                </div>
              )}

              {streamPhase === 'tendered' && (
                <div className="mt-4 p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-[11px] text-slate-400 space-y-1 animate-fadeIn">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    🔒 PCI GATEWAY VERIFIED ({selectedLane.receipt.payment_gateway_response.terminal})
                  </div>
                  <div>• STATUS: <strong className="text-emerald-300">{selectedLane.receipt.payment_gateway_response.status}</strong> (Auth Code: {selectedLane.receipt.payment_gateway_response.auth_code})</div>
                  <div>• ENCRYPTION HANDSHAKE: <span className="text-slate-300">{selectedLane.timings.dukpt_tokenization_ms} ms</span> ({selectedLane.receipt.payment_gateway_response.pci_encryption})</div>
                  <div>• NETWORK SEGMENT: <span className="text-amber-300">{selectedLane.receipt.payment_gateway_response.network_segment}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Node & Process Telemetry Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Physical Node & Workload Resource Telemetry
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                3 Bare-Metal Nodes
              </span>
            </div>

            <div className="space-y-3">
              {(testResult?.nodeMetrics || [
                { node: `${clusterName}-node-1`, role: `POS Commerce Engine (${laneCount} Lane Pods on VLAN 3130)`, cpuUsage: "24%", cpuCores: "140m / 8000m", memoryUsage: "28%", memoryBytes: "7.1 GiB / 32 GiB", networkIo: "1.8 MB/s", podHealth: "100% (Ready)" },
                { node: `${clusterName}-node-2`, role: `PIN Pad DUKPT Gateway (${laneCount} Terminals on VLAN 3430)`, cpuUsage: "16%", cpuCores: "95m / 8000m", memoryUsage: "22%", memoryBytes: "5.8 GiB / 32 GiB", networkIo: "1.1 MB/s", podHealth: "100% (Ready)" },
                { node: `${clusterName}-node-3`, role: "Smart Cart Vision & Storage (TopoLVM)", cpuUsage: "34%", cpuCores: "220m / 8000m", memoryUsage: "41%", memoryBytes: "11.2 GiB / 32 GiB", networkIo: "4.2 MB/s", podHealth: "100% (Ready)" }
              ]).map((nm: any) => (
                <div key={nm.node} className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 font-mono text-xs transition hover:border-slate-700">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white">{nm.node}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">{nm.role}</span>
                    </div>
                    <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {nm.podHealth}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-[11px]">
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
                        <span>VLAN I/O</span>
                        <span className="text-amber-300 font-bold">{nm.networkIo}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full" style={{ width: "40%" }} />
                      </div>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">Multus Dual-Overlay</span>
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
