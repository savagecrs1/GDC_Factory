'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Code, CheckCircle2, RefreshCw, Box, ArrowUpRight, Sparkles, Terminal } from 'lucide-react';
import WebTerminalModal from './WebTerminalModal';

export interface PresetWorkload {
  id: string;
  name: string;
  image: string;
  port: number;
  replicas: number;
  description: string;
  badge: string;
}

export const PRESET_WORKLOADS: PresetWorkload[] = [
  {
    id: 'nginx-edge',
    name: 'kroger-pos-engine',
    image: 'nginx:alpine',
    port: 8080,
    replicas: 3,
    description: 'Store point-of-sale checkout processing gateway with HA multi-lane routing.',
    badge: 'Store POS',
  },
  {
    id: 'aisle-vision',
    name: 'aisle-spill-vision',
    image: 'traefik/whoami',
    port: 80,
    replicas: 2,
    description: 'Real-time aisle camera feed AI spill & out-of-stock anomaly detection proxy.',
    badge: 'Computer Vision',
  },
  {
    id: 'smart-cart',
    name: 'smart-cart-gateway',
    image: 'nginxdemos/hello',
    port: 80,
    replicas: 5,
    description: 'Wi-Fi mesh telemetry aggregator for automated in-cart item scanning.',
    badge: 'IoT Smart Cart',
  },
  {
    id: 'curbside-queue',
    name: 'clicklist-curbside',
    image: 'gcr.io/google-samples/microservices-demo/frontend:v0.8.0',
    port: 8080,
    replicas: 2,
    description: 'ClickList pickup order fulfillment and customer arrival notification dispatcher.',
    badge: 'ClickList Pickup',
  },
  {
    id: 'cooler-iot',
    name: 'cooler-temp-monitor',
    image: 'redis:7.0-alpine',
    port: 6379,
    replicas: 1,
    description: 'Refrigeration and freezer temperature sensor telemetry telemetry store.',
    badge: 'IoT Cooler',
  },
];

interface WorkloadManagerProps {
  clusterName: string;
  projectId?: string;
}

export default function WorkloadManager({ clusterName, projectId }: WorkloadManagerProps) {
  const [workloads, setWorkloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [showYamlPreview, setShowYamlPreview] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('nginx-edge');
  const [terminalTarget, setTerminalTarget] = useState<{ name: string; namespace?: string } | null>(null);

  // Form state
  const [appName, setAppName] = useState('kroger-pos-engine');
  const [image, setImage] = useState('nginx:alpine');
  const [replicas, setReplicas] = useState(3);
  const [port, setPort] = useState(80);
  const [namespace, setNamespace] = useState('default');
  const [network, setNetwork] = useState('default');
  const [useGvisor, setUseGvisor] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);

  const selectPreset = (preset: PresetWorkload) => {
    setSelectedPresetId(preset.id);
    setAppName(preset.name);
    setImage(preset.image);
    setPort(preset.port);
    setReplicas(preset.replicas);
  };

  const fetchWorkloads = () => {
    setLoading(true);
    const url = `/api/kubernetes/workloads?clusterName=${encodeURIComponent(clusterName)}` + (projectId ? `&projectId=${encodeURIComponent(projectId)}` : '');
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setWorkloads(data.workloads || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    fetch(`/api/kubernetes/networks?clusterName=${encodeURIComponent(clusterName)}` + (projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''))
      .then((res) => res.json())
      .then((data) => setAvailableNetworks(data.networks || []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchWorkloads();
  }, [clusterName, projectId]);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch('/api/kubernetes/workloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: appName, image, replicas, port, namespace, network, clusterName, projectId }),
      });
      if (res.ok) {
        setShowDeployForm(false);
        fetchWorkloads();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async (name: string) => {
    await fetch('/api/kubernetes/workloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action: 'delete' }),
    });
    fetchWorkloads();
  };

  const generatedYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}${network !== 'default' ? `\n      annotations:\n        k8s.v1.cni.cncf.io/networks: ${network}` : ''}
    spec:
      containers:
        - name: ${appName}
          image: ${image}
          ports:
            - containerPort: ${port}
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}-svc
  namespace: ${namespace}
spec:
  type: ClusterIP
  selector:
    app: ${appName}
  ports:
    - port: ${port}
      targetPort: ${port}`;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-indigo-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">Kubernetes Workloads & Pods</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                GDC Native
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Manage container deployments, Service routing, and PCI Multus network attachments across <strong className="text-slate-200">{clusterName}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={fetchWorkloads}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowDeployForm(!showDeployForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            {showDeployForm ? 'Cancel' : 'Deploy Workload'}
          </button>
        </div>
      </div>

      {/* Deploy Form Modal/Drawer */}
      {showDeployForm && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 animate-fadeIn space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Configure Kubernetes Workload Manifest
            </h3>
            <button
              onClick={() => setShowYamlPreview(!showYamlPreview)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sky-300 border border-slate-700 transition"
            >
              <Code className="w-3.5 h-3.5" />
              {showYamlPreview ? 'Hide YAML Manifest' : 'Preview YAML Manifest'}
            </button>
          </div>

          {/* Quick-Select Workload Templates */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Quick-Select Testing Templates</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {PRESET_WORKLOADS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => selectPreset(preset)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500/60 shadow-lg shadow-sky-500/10'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-white text-sm truncate">{preset.badge}</span>
                        <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                          {preset.replicas}x
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{preset.description}</p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-sky-400">
                      <span className="truncate">{preset.name}</span>
                      <span>:{preset.port}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Application Name</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Container Image</label>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                placeholder="e.g. gcr.io/my-proj/app:v1"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Pod Replicas</label>
              <select
                value={replicas}
                onChange={(e) => setReplicas(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value={1}>1 Replica</option>
                <option value={2}>2 Replicas (HA)</option>
                <option value={3}>3 Replicas (HA Plus)</option>
                <option value={5}>5 Replicas</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Service Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                <span>VLAN Network (Multus)</span>
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
              >
                <option value="default">Default Pod Net (kube0)</option>
                <option value="pci-vlan-123">pci-vlan-123 (VLAN 123 - PCI)</option>
                <option value="tenant-vlan-456">tenant-vlan-456 (VLAN 456)</option>
                {availableNetworks.map((n: any, idx: number) => (
                  <option key={idx} value={n.name}>{n.name} (VLAN {n.vlanId})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={useGvisor}
                onChange={(e) => setUseGvisor(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0"
              />
              <div className="text-xs">
                <div className="font-bold text-white flex items-center gap-2">
                  <span>🛡️ Enable gVisor (`runsc`) Container Security Sandbox</span>
                  <span className="text-[10px] bg-purple-950 text-purple-400 border border-purple-800 px-2 py-0.5 rounded-full font-mono">
                    b/523229462
                  </span>
                </div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Executes workload inside lightweight Sentry kernel with `--platform=systrap` isolation (0 cluster restarts required).
                </div>
              </div>
            </label>
          </div>

          {showYamlPreview && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-sky-300 overflow-x-auto">
              <pre>{generatedYaml}</pre>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setShowDeployForm(false)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-sky-500/20 transition flex items-center gap-2"
            >
              {deploying && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Apply Workload to Cluster</span>
            </button>
          </div>
        </div>
      )}

      {/* Workloads Table */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Workload Name</th>
                <th className="py-3 px-4 font-semibold">Kind</th>
                <th className="py-3 px-4 font-semibold">Container Image</th>
                <th className="py-3 px-4 font-semibold">Replicas</th>
                <th className="py-3 px-4 font-semibold">CPU / Mem</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {workloads.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
                      <Box className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white">{w.name}</div>
                      <div className="text-xs text-slate-400">ns: {w.namespace}</div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">{w.kind}</td>
                  <td className="py-3.5 px-4 text-slate-400 font-mono text-xs max-w-[200px] truncate" title={w.image}>{w.image}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-semibold">{w.replicas}</td>
                  <td className="py-3.5 px-4">
                    <div className="space-y-1.5 min-w-[120px]">
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="text-slate-500">CPU</span>
                          <span className="font-mono text-sky-400">{w.cpu || '12m'}</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                          <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${w.cpuPercent || 8}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="text-slate-500">RAM</span>
                          <span className="font-mono text-purple-400">{w.mem || '64 Mi'}</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                          <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${w.memPercent || 12}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {w.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => setTerminalTarget({ name: `pod/${w.name}-6f66ff8cd7-jxtbv`, namespace: w.namespace })}
                      className="p-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition border border-slate-700 flex items-center gap-1.5 text-xs font-medium"
                      title="Exec into Container Pod"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Exec</span>
                    </button>

                    <button
                      onClick={() => handleDelete(w.name)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition border border-rose-500/20"
                      title="Delete Workload"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Web Terminal Modal */}
      {terminalTarget && (
        <WebTerminalModal
          isOpen={!!terminalTarget}
          onClose={() => setTerminalTarget(null)}
          targetType="pod"
          targetName={terminalTarget.name}
          namespace={terminalTarget.namespace}
          projectId={projectId || 'vdc-18818'}
        />
      )}
    </div>
  );
}

