'use client';

import React, { useState } from 'react';
import { ShoppingCart, ShieldCheck, Activity, Cpu, Server, Zap, RefreshCw, CheckCircle2, Clock, Lock, Layers, Users, CreditCard } from 'lucide-react';

interface RetailTestDashboardProps {
  clusterName: string;
  projectId?: string;
}

export default function RetailTestDashboard({ clusterName, projectId }: RetailTestDashboardProps) {
  const [itemCount, setItemCount] = useState<number>(12);
  const [laneCount, setLaneCount] = useState<number>(6);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleRunCheckout = async (itemsToRun?: number, lanesToRun?: number) => {
    const targetItems = itemsToRun || itemCount;
    const targetLanes = lanesToRun || laneCount;
    setLoading(true);
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
      }
    } catch (err) {
      console.error('Error running multi-lane retail checkout:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedLane = testResult?.lanes?.[selectedLaneIndex] || testResult?.lanes?.[0];

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
                Kroger Retail Edge Sandbox & Multi-Lane Concurrency
                <span className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2.5 py-0.5 rounded-full font-mono font-normal">
                  VLAN 3130 ↔ VLAN 3430
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Simulate up to 24 concurrent store checkout lanes, measure aggregate DUKPT PIN pad tokenization speed, and monitor live bare-metal node telemetry.
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
                Store Checkout Concurrency Setup
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                Multi-Lane Scaling
              </span>
            </div>

            <div className="space-y-5">
              {/* Lane Concurrency Slider */}
              <div>
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

              {/* Basket Item Count Slider */}
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
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                <span>Execute {laneCount}-Lane Concurrency Test Across PCI VLAN</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed font-mono">
              <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                Multi-Lane Network Assurance
              </div>
              <p>
                • Generates {laneCount} concurrent cashier pods across <span className="text-sky-300">VLAN 3130</span>.
              </p>
              <p>
                • Parallel DUKPT encryption handshakes across <span className="text-amber-300">VLAN 3430</span> without packet collision.
              </p>
              <p>
                • Measures aggregate store throughput (TPS) and P95 latency distribution.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Multi-Lane Grid, Metrics, and Receipt (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Aggregate Store Concurrency Metrics Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                Aggregate Store Throughput & Latency Distribution
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                {testResult?.metrics ? `${testResult.metrics.totalLanes} Lanes Active` : 'Real-Time Telemetry'}
              </span>
            </div>

            {testResult?.metrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-sky-400" /> AVG LATENCY
                  </span>
                  <span className="text-xl font-bold font-mono text-white block">{testResult.metrics.avgLatencyMs} ms</span>
                  <span className="text-[10px] text-emerald-400 block font-mono">P95: {testResult.metrics.p95LatencyMs} ms</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <ShoppingCart className="w-3 h-3 text-emerald-400" /> TOTAL GROCERIES
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-400 block">{testResult.metrics.totalItemsScanned}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Across all {testResult.metrics.totalLanes} lanes</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-400" /> TOTAL REVENUE
                  </span>
                  <span className="text-xl font-bold font-mono text-amber-400 block">{testResult.metrics.totalRevenue}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">DUKPT Tokenized</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Zap className="w-3 h-3 text-indigo-400" /> STORE THROUGHPUT
                  </span>
                  <span className="text-xl font-bold font-mono text-indigo-300 block">{testResult.metrics.tpsRate} TPS</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Aggregate Peak Rate</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/60 font-mono text-xs">
                Select lane count and click execute on the left to test multi-lane register concurrency across the store network.
              </div>
            )}
          </div>

          {/* Multi-Lane Live Grid Selector */}
          {testResult?.lanes && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-md flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Active Store Register Lanes (Click to Inspect Receipt)
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
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate block mt-1">{lane.lane_type}</span>
                    <div className="flex justify-between items-center mt-2 pt-1 border-t border-slate-800/80 text-[10px]">
                      <span className="text-emerald-400 font-bold">{lane.receipt.total_paid}</span>
                      <span className="text-slate-400">{lane.latency_ms}ms</span>
                    </div>
                  </button>
                ))}
              </div>
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

          {/* Itemized Grocery Receipt Display for Selected Lane */}
          {selectedLane && (
            <div className="glass-panel p-6 rounded-2xl border border-emerald-500/40 bg-emerald-950/10 space-y-3 font-mono text-xs animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 text-emerald-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> KROGER RECEIPT: {selectedLane.lane_name}
                </span>
                <span className="bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30">
                  {selectedLane.receipt.total_paid}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-400 text-[11px] pb-2 border-b border-slate-800/80">
                <div><strong>TX ID:</strong> {selectedLane.receipt.transaction_id}</div>
                <div><strong>STORE:</strong> {selectedLane.receipt.store}</div>
                <div><strong>LANE TYPE:</strong> {selectedLane.lane_type}</div>
                <div><strong>LATENCY:</strong> <span className="text-white font-bold">{selectedLane.latency_ms} ms</span></div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 py-2 border-b border-slate-800/80 text-slate-300">
                {selectedLane.receipt.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-1 hover:bg-slate-900/50 px-2 rounded">
                    <span><strong className="text-slate-500">{item.sku}</strong> {item.name}</span>
                    <span className="font-bold text-white">{item.price}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-1 text-slate-300 text-sm font-bold">
                <span>SUBTOTAL ({selectedLane.receipt.items.length} items):</span>
                <span>{selectedLane.receipt.subtotal}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>ESTIMATED TAX (7%):</span>
                <span>{selectedLane.receipt.tax}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-emerald-400 text-base font-bold">
                <span>TOTAL PAID:</span>
                <span>{selectedLane.receipt.total_paid}</span>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-[11px] text-slate-400 space-y-1">
                <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                  🔒 PCI GATEWAY VERIFICATION ({selectedLane.receipt.payment_gateway_response.terminal})
                </div>
                <div>• STATUS: <strong className="text-emerald-300">{selectedLane.receipt.payment_gateway_response.status}</strong> (Auth: {selectedLane.receipt.payment_gateway_response.auth_code})</div>
                <div>• ENCRYPTION: <span className="text-slate-300">{selectedLane.receipt.payment_gateway_response.pci_encryption}</span></div>
                <div>• NETWORK SEGMENT: <span className="text-amber-300">{selectedLane.receipt.payment_gateway_response.network_segment}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
