'use client';

import React, { useState, useEffect } from 'react';
import { GitBranch, RefreshCw, Plus, Trash2, CheckCircle2, AlertCircle, FileCode, Layers, Server, Shield, ExternalLink, GitCommit, ArrowRight } from 'lucide-react';

interface ConfigSyncManagerProps {
  clusterName: string;
  projectId?: string;
}

export default function ConfigSyncManager({ clusterName, projectId }: ConfigSyncManagerProps) {
  const [rootSyncs, setRootSyncs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [name, setName] = useState('root-sync-store');
  const [repo, setRepo] = useState('https://github.com/google-cloud-platform/anthos-config-management-samples.git');
  const [branch, setBranch] = useState('main');
  const [dir, setDir] = useState('/profiles/store-standard');
  const [auth, setAuth] = useState('none');
  const [secretRef, setSecretRef] = useState('git-creds-secret');
  const [period, setPeriod] = useState('15s');
  const [checkoutReceipt, setCheckoutReceipt] = useState<any>(null);
  const [testingCheckout, setTestingCheckout] = useState(false);

  const handleTestCheckout = async () => {
    setTestingCheckout(true);
    setCheckoutReceipt(null);
    try {
      const res = await fetch('/api/kubernetes/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, projectId }),
      });
      const data = await res.json();
      if (data.receipt) setCheckoutReceipt(data.receipt);
    } catch (err) {
      console.error('Checkout simulation error:', err);
    } finally {
      setTestingCheckout(false);
    }
  };

  const fetchRootSyncs = () => {
    setLoading(true);
    fetch(`/api/kubernetes/configsync?clusterName=${encodeURIComponent(clusterName)}&projectId=${encodeURIComponent(projectId || 'kroger-store-test1')}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.rootSyncs) {
          setRootSyncs(data.rootSyncs);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRootSyncs();
    const interval = setInterval(fetchRootSyncs, 10000);
    return () => clearInterval(interval);
  }, [clusterName, projectId]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/kubernetes/configsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, projectId, name, repo, branch, dir, auth, secretRef, period }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        fetchRootSyncs();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to submit Config Sync profile' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (syncName: string) => {
    if (!confirm(`Are you sure you want to remove RootSync '${syncName}'? physical node configurations will no longer receive automated GitOps updates.`)) return;
    
    try {
      const res = await fetch(`/api/kubernetes/configsync?clusterName=${encodeURIComponent(clusterName)}&projectId=${encodeURIComponent(projectId || 'kroger-store-test1')}&name=${encodeURIComponent(syncName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        fetchRootSyncs();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Delete exception' });
    }
  };

  const applyPreset = (presetName: string, presetRepo: string, presetDir: string, presetAuth = 'none') => {
    setName(presetName);
    setRepo(presetRepo);
    setDir(presetDir);
    setAuth(presetAuth);
  };

  const generatedYaml = `apiVersion: configsync.gke.io/v1beta1
kind: RootSync
metadata:
  name: ${name}
  namespace: config-management-system
spec:
  sourceFormat: unstructured
  git:
    repo: "${repo}"
    branch: "${branch}"
    dir: "${dir}"
    auth: "${auth}"${auth !== 'none' && secretRef ? `\n    secretRef:\n      name: ${secretRef}` : ''}
    period: "${period}"
  override:
    reconcileTimeout: "5m0s"
    statusMode: "enabled"`;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-sky-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <GitBranch className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">GitOps Config Sync & Workload Automation Engine</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                configsync.gke.io/v1beta1
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Manage RootSync and RepoSync CRDs to continuously deploy, reconcile, and enforce Kubernetes workloads on physical GDC nodes.
            </p>
          </div>
        </div>

        <button
          onClick={fetchRootSyncs}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700 self-end md:self-center"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Sync Status
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
          message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Preset Kroger Retail Profile Selector */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            Preset Workload Profiles (Click to Auto-Configure)
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">1-Click GitOps Setup</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => applyPreset('root-sync-grocery-pos', 'https://github.com/savagecrs1/gdc-vm-configs.git', '/kroger-gdc-portal/gitops-profiles/grocery-store-emulator', 'none')}
            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/80 text-left transition flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs group-hover:text-sky-300 transition">🏪 Standard Grocery POS Profile</span>
                <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20 font-mono">/grocery-pos</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Deploys store POS engine, smart cart gateway, and localized transaction logging pods across all 3 bare metal nodes.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('root-sync-mfc-robotics', 'https://github.com/google-cloud-platform/anthos-config-management-samples.git', '/profiles/mfc-robotics', 'token')}
            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/80 text-left transition flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs group-hover:text-sky-300 transition">🤖 MFC Robotics & AI Vision</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-mono">/mfc-robotics</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Installs automated fulfillment aisle telemetry, Robin SDS persistent storage, and high-speed MQTT message brokers.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('root-sync-pci-security', 'https://github.com/google-cloud-platform/anthos-config-management-samples.git', '/policies/pci-dss-v4', 'token')}
            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/80 text-left transition flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs group-hover:text-sky-300 transition">🔒 PCI-DSS Compliance Bundle</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">/pci-dss-v4</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Enforces OPA Gatekeeper zero-trust network policies, mTLS mesh encryption, and strict container security contexts.
              </p>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active RootSyncs (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-sky-400" />
                Active GitOps RootSyncs on {clusterName}
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono">
                {rootSyncs.length} Configured Syncs
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center items-center text-slate-500 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
                <span className="text-xs">Querying Config Sync operator status...</span>
              </div>
            ) : rootSyncs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <p className="text-sm font-medium text-slate-400">No active RootSync objects found</p>
                <p className="text-xs">Use the wizard below to configure continuous workload syncing from Git repositories.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rootSyncs.map((sync: any) => (
                  <div key={sync.name} className="p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-3 transition hover:border-slate-600">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${sync.status === 'SYNCED' ? 'bg-emerald-400 animate-pulse' : sync.status === 'ERROR' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                          <h4 className="font-bold text-white text-sm">{sync.name}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            {sync.namespace}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-sky-400 mt-1 truncate max-w-md">{sync.repo}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          sync.status === 'SYNCED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          sync.status === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {sync.status}
                        </span>
                        <button
                          onClick={() => handleDelete(sync.name)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                          title="Delete RootSync"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-950/80 text-[11px] font-mono border border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block text-[10px]">BRANCH / DIR</span>
                        <span className="text-slate-300 truncate block">{sync.branch} : {sync.dir}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">SYNCED COMMIT</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <GitCommit className="w-3 h-3 flex-shrink-0" />
                          {sync.commit}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">LAST RECONCILED</span>
                        <span className="text-slate-400 truncate block">{new Date(sync.lastSynced).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    {sync.message && (
                      <p className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded border-l-2 border-slate-700">
                        💬 {sync.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Physical Node Workload Deployment Mapping Preview */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Physical GDC Node Workload Reconciliation Map
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex flex-col items-center justify-center space-y-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold text-white">node-1 (Bare Metal)</span>
                <span className="text-[10px] text-slate-400 truncate">10.10.0.4 • GitOps Active</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex flex-col items-center justify-center space-y-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold text-white">node-2 (Bare Metal)</span>
                <span className="text-[10px] text-slate-400 truncate">10.10.0.5 • GitOps Active</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 flex flex-col items-center justify-center space-y-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold text-white">node-3 (Bare Metal)</span>
                <span className="text-[10px] text-slate-400 truncate">10.10.0.3 • GitOps Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Create RootSync Form & Live YAML Preview (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleApply} className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-md flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                Configure New GitOps RootSync
              </h3>
              <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20 font-mono">v1beta1</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">RootSync Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Git Repository URL</label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sync Directory</label>
                  <input
                    type="text"
                    value={dir}
                    onChange={(e) => setDir(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Auth Type</label>
                  <select
                    value={auth}
                    onChange={(e) => setAuth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition"
                  >
                    <option value="none">None (Public Repo)</option>
                    <option value="token">Git Token / Secret</option>
                    <option value="ssh">SSH Keypair</option>
                    <option value="gcpserviceaccount">GCP Workload Identity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sync Polling Period</label>
                  <input
                    type="text"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>

              {auth !== 'none' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kubernetes Secret Ref Name</label>
                  <input
                    type="text"
                    value={secretRef}
                    onChange={(e) => setSecretRef(e.target.value)}
                    placeholder="git-creds-secret"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition mt-2"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Apply RootSync to Physical GDC Cluster</span>
            </button>
          </form>

          {/* Live CRD YAML Preview */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-sky-400" />
                Live RootSync Manifest Preview
              </span>
              <span className="text-[10px] text-slate-500 font-mono">YAML</span>
            </div>
            <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-sky-300 overflow-x-auto leading-relaxed">
              {generatedYaml}
            </pre>
          </div>

          {/* Cashier Checkout Simulator Box */}
          <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  🛒 Store Register & PIN Pad Transaction Simulator
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Executes a live checkout transaction from the POS register pod across the PCI VLAN to the payment gateway.
                </p>
              </div>
              <button
                onClick={handleTestCheckout}
                disabled={testingCheckout}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition flex-shrink-0"
              >
                {testingCheckout ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>💳 Test Cashier Checkout</span>}
              </button>
            </div>

            {checkoutReceipt && (
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-2 text-xs font-mono text-slate-300 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2 text-emerald-400 font-bold">
                  <span>RECEIPT: {checkoutReceipt.transaction_id || 'POS-SIM'}</span>
                  <span>{checkoutReceipt.total_paid}</span>
                </div>
                <pre className="text-[11px] overflow-x-auto text-slate-300 leading-relaxed">
                  {JSON.stringify(checkoutReceipt, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
