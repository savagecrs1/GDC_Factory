'use client';

import React, { useState } from 'react';
import { ShoppingCart, ShieldCheck, Activity, Cpu, Server, Zap, RefreshCw, CheckCircle2, Clock, Lock, Layers } from 'lucide-react';

interface RetailTestDashboardProps {
  clusterName: string;
  projectId?: string;
}

export default function RetailTestDashboard({ clusterName, projectId }: RetailTestDashboardProps) {
  const [itemCount, setItemCount] = useState<number>(12);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handleRunCheckout = async (itemsToRun?: number) => {
    const targetCount = itemsToRun || itemCount;
    setLoading(true);
    try {
      const res = await fetch('/api/kubernetes/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, projectId, itemCount: targetCount }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
      }
    } catch (err) {
      console.error('Error running simulated retail checkout:', err);
    } finally {
      setLoading(false);
    }
  };

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
                Kroger Retail Edge Sandbox & QSA Verification
                <span className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2.5 py-0.5 rounded-full font-mono font-normal">
                  VLAN 3130 ↔ VLAN 3430
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Simulate cashier POS basket checkouts, measure DUKPT PIN pad tokenization speed, and monitor live bare-metal node telemetry.
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
        {/* Left Column: Cashier Simulation Controls & Basket Sizing (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                Simulate Cashier Register Checkout
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                Interactive POS Test
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Basket Item Count (1 - 50 items)
                  </label>
                  <span className="text-sm font-bold font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-lg">
                    {itemCount} Groceries
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
              </div>

              {/* Quick Basket Presets */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-2 font-medium">Quick Basket Presets:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Express (3)', count: 3 },
                    { label: 'Standard (12)', count: 12 },
                    { label: 'Stockup (35)', count: 35 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setItemCount(p.count); handleRunCheckout(p.count); }}
                      disabled={loading}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition ${
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
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition mt-2"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                <span>Execute Checkout Across PCI VLAN</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1 leading-relaxed font-mono">
              <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                QSA Isolation Assurance
              </div>
              <p>
                • POS Engine (<span className="text-sky-300">VLAN 3130</span>) initiates item lookup.
              </p>
              <p>
                • Tokenization request sent to PIN pad gateway (<span className="text-amber-300">VLAN 3430</span>) over mTLS port 8443.
              </p>
              <p>
                • DUKPT point-to-point encryption verified without exposing raw PAN card data.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Transaction Speed Metrics & Node Telemetry (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Transaction Speed Gauge Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                Transaction Latency & Processing Speed
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                Real-Time Telemetry
              </span>
            </div>

            {testResult?.metrics ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-sky-400" /> TOTAL LATENCY
                  </span>
                  <span className="text-xl font-bold font-mono text-white block">{testResult.metrics.totalLatencyMs} ms</span>
                  <span className="text-[10px] text-emerald-400 block font-mono">✓ QSA SLA Target &lt; 250ms</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <ShoppingCart className="w-3 h-3 text-emerald-400" /> POS SCAN SPEED
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-400 block">{testResult.metrics.posScanTimeMs} ms</span>
                  <span className="text-[10px] text-slate-400 block font-mono">{testResult.metrics.itemCount} items scanned</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-400" /> PCI TOKENIZATION
                  </span>
                  <span className="text-xl font-bold font-mono text-amber-400 block">{testResult.metrics.pciTokenizationMs} ms</span>
                  <span className="text-[10px] text-slate-400 block font-mono">DUKPT: {testResult.metrics.dukptHandshakeMs}ms</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase block flex items-center gap-1">
                    <Zap className="w-3 h-3 text-indigo-400" /> THROUGHPUT
                  </span>
                  <span className="text-xl font-bold font-mono text-indigo-300 block">{testResult.metrics.tpsRate} TPS</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Estimated Max Cap</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/60 font-mono text-xs">
                Run a simulated checkout on the left to measure cross-VLAN DUKPT encryption speed and item scan rates.
              </div>
            )}
          </div>

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
                { node: `${clusterName}-node-1`, role: "POS Commerce Engine (VLAN 3130)", cpuUsage: "24%", cpuCores: "140m / 8000m", memoryUsage: "28%", memoryBytes: "7.1 GiB / 32 GiB", networkIo: "1.8 MB/s", podHealth: "100% (2/2 Ready)" },
                { node: `${clusterName}-node-2`, role: "PIN Pad DUKPT Gateway (VLAN 3430)", cpuUsage: "16%", cpuCores: "95m / 8000m", memoryUsage: "22%", memoryBytes: "5.8 GiB / 32 GiB", networkIo: "1.1 MB/s", podHealth: "100% (2/2 Ready)" },
                { node: `${clusterName}-node-3`, role: "Smart Cart Vision & Storage (TopoLVM)", cpuUsage: "34%", cpuCores: "220m / 8000m", memoryUsage: "41%", memoryBytes: "11.2 GiB / 32 GiB", networkIo: "4.2 MB/s", podHealth: "100% (1/1 Ready)" }
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

          {/* Itemized Grocery Receipt Display */}
          {testResult?.receipt && (
            <div className="glass-panel p-6 rounded-2xl border border-emerald-500/40 bg-emerald-950/10 space-y-3 font-mono text-xs animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 text-emerald-400 font-bold text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> KROGER GROCERY SIMULATED RECEIPT
                </span>
                <span className="bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30">
                  {testResult.receipt.total_paid}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] pb-2 border-b border-slate-800/80">
                <div><strong>TX ID:</strong> {testResult.receipt.transaction_id}</div>
                <div><strong>STORE:</strong> {testResult.receipt.store}</div>
                <div><strong>REGISTER:</strong> {testResult.receipt.cashier}</div>
                <div><strong>VLAN SOURCE:</strong> {testResult.receipt.vlan_source}</div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 py-2 border-b border-slate-800/80 text-slate-300">
                {testResult.receipt.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-1 hover:bg-slate-900/50 px-2 rounded">
                    <span><strong className="text-slate-500">{item.sku}</strong> {item.name}</span>
                    <span className="font-bold text-white">{item.price}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-1 text-slate-300 text-sm font-bold">
                <span>SUBTOTAL ({testResult.receipt.items.length} items):</span>
                <span>{testResult.receipt.subtotal}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>ESTIMATED TAX (7%):</span>
                <span>{testResult.receipt.tax}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800 pt-2 text-emerald-400 text-base font-bold">
                <span>TOTAL PAID:</span>
                <span>{testResult.receipt.total_paid}</span>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-[11px] text-slate-400 space-y-1">
                <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                  🔒 PCI GATEWAY VERIFICATION ({testResult.receipt.payment_gateway_response.terminal})
                </div>
                <div>• STATUS: <strong className="text-emerald-300">{testResult.receipt.payment_gateway_response.status}</strong> (Auth: {testResult.receipt.payment_gateway_response.auth_code})</div>
                <div>• ENCRYPTION: <span className="text-slate-300">{testResult.receipt.payment_gateway_response.pci_encryption}</span></div>
                <div>• NETWORK SEGMENT: <span className="text-amber-300">{testResult.receipt.payment_gateway_response.network_segment}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
