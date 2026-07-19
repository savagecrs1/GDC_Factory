'use client';

import React, { useState, useEffect } from 'react';
import { X, Network, CheckCircle, AlertTriangle, XCircle, RefreshCw, Shield, Server, ArrowRight, Zap } from 'lucide-react';

interface DiagnosticHop {
  id: string;
  name: string;
  category: 'api' | 'qbone' | 'vlan' | 'nat' | 'ports';
  status: 'passed' | 'failed' | 'warning';
  latencyMs: number;
  details: string;
  remediation?: string;
}

interface NetworkDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  clusterName: string;
}

export default function NetworkDiagnosticModal({
  isOpen,
  onClose,
  projectId,
  clusterName,
}: NetworkDiagnosticModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/gcp/network/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, clusterName, vlanId: 123 }),
      });
      const result = await res.json();
      setData(result);
    } catch (e) {
      console.error('Diagnostic error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen, projectId, clusterName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Network className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                GDC Connectivity & Network Diagnostics Suite
                <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-800 px-2 py-0.5 rounded-full font-mono">
                  {projectId}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Probing Google APIs, QBone ALPN HTTP/2 tunnels, VLAN tagging, and Cloud NAT MTU limits.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Diagnostic Summary Header */}
          <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              {loading ? (
                <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
              ) : data?.overallPassed ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <div className="text-xs font-bold text-white">
                  {loading
                    ? 'Executing 5-Layer Network Probes...'
                    : data?.overallPassed
                    ? 'All Connectivity & QBone Probes Passed'
                    : 'Network Bottleneck or Configuration Issue Detected'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {data ? `${data.passedCount} of ${data.totalCount} diagnostic checks passed` : 'Probing target cluster...'}
                </div>
              </div>
            </div>

            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Re-run Diagnostics</span>
            </button>
          </div>

          {/* Hop Probes List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">5-Layer Diagnostic Hop Results</h3>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
                <p className="text-xs font-mono">Running ALPN HTTP/2 negotiation & VLAN subinterface probes...</p>
              </div>
            ) : (
              data?.hops?.map((hop: DiagnosticHop) => (
                <div
                  key={hop.id}
                  className={`p-4 rounded-xl border transition-all ${
                    hop.status === 'passed'
                      ? 'bg-slate-950/40 border-slate-800'
                      : hop.status === 'warning'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {hop.status === 'passed' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : hop.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          {hop.name}
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {hop.latencyMs}ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{hop.details}</p>

                        {hop.remediation && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                            <span className="text-amber-400 font-bold">💡 Pinpointed Resolution: </span>
                            <span className="text-slate-200">{hop.remediation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Verification Protocol: ALPN h2 / TLS 1.3 / ICMP 1400 MTU</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
