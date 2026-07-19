'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, Play, Square, Trash2, Plus, Code, Eye, CheckCircle2, HardDrive, Network, RefreshCw, Terminal } from 'lucide-react';
import WebTerminalModal from './WebTerminalModal';
import VmDeploymentTracker from './VmDeploymentTracker';

interface VmManagerProps {
  clusterName: string;
  projectId?: string;
}

export default function VmManager({ clusterName, projectId }: VmManagerProps) {
  const [vms, setVms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [showYamlPreview, setShowYamlPreview] = useState(false);
  const [terminalTarget, setTerminalTarget] = useState<{ name: string; type: 'vm' | 'node'; namespace?: string } | null>(null);
  const [activeTrackerVm, setActiveTrackerVm] = useState<{ name: string; namespace: string } | null>(null);

  // Form state
  const [vmName, setVmName] = useState('edge-analytics-vm');
  const [cpus, setCpus] = useState(2);
  const [memory, setMemory] = useState('2Gi');
  const [image, setImage] = useState('ubuntu-22.04-server-cloudimg-amd64');
  const [imageType, setImageType] = useState<'preset' | 'custom-url' | 'custom-registry'>('preset');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [namespace, setNamespace] = useState('gdc-vms');
  const [network, setNetwork] = useState('default');
  const [availableNetworks, setAvailableNetworks] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchVms = () => {
    setLoading(true);
    const url = `/api/kubernetes/vms?clusterName=${encodeURIComponent(clusterName)}` + (projectId ? `&projectId=${encodeURIComponent(projectId)}` : '');
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setVms(data.vms || []);
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
    fetchVms();
  }, [clusterName, projectId]);

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMessage(null);
    try {
      const finalImage = imageType === 'preset' ? image : customImageUrl;
      const res = await fetch('/api/kubernetes/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: vmName, cpus, memory, image: finalImage, imageType, namespace, network, clusterName, projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeployMessage({ type: 'success', text: data.message || `Virtual machine ${vmName} deployed successfully!` });
        setShowDeployForm(false);
        setActiveTrackerVm({ name: vmName, namespace: namespace });
        fetchVms();
      } else {
        setDeployMessage({ type: 'error', text: data.error || `Failed to deploy VM ${vmName}.` });
      }
    } catch (err: any) {
      setDeployMessage({ type: 'error', text: err?.message || 'Network error during VM deployment.' });
    } finally {
      setDeploying(false);
    }
  };

  const handlePowerToggle = async (name: string) => {
    await fetch('/api/kubernetes/vms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action: 'power-toggle' }),
    });
    fetchVms();
  };

  const handleDelete = async (name: string) => {
    await fetch('/api/kubernetes/vms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action: 'delete' }),
    });
    fetchVms();
  };

  const generatedYaml = `apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: ${vmName}
  namespace: ${namespace}
spec:
  running: true
  template:
    metadata:
      labels:
        gdc.google.com/vm: ${vmName}${network !== 'default' ? `\n      annotations:\n        k8s.v1.cni.cncf.io/networks: ${network}` : ''}
    spec:
      domain:
        cpu:
          cores: ${cpus}
        resources:
          requests:
            memory: ${memory}
        devices:
          disks:
            - name: datavolume-disk
              disk:
                bus: virtio
      volumes:
        - name: datavolume-disk
          ${imageType === 'custom-url' ? `dataVolume:\n            name: ${vmName}-dv\n  dataVolumeTemplates:\n    - metadata:\n        name: ${vmName}-dv\n      spec:\n        pvc:\n          accessModes:\n            - ReadWriteOnce\n          resources:\n            - requests:\n                storage: 20Gi\n        source:\n          http:\n            url: "${customImageUrl || 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.disk-kvm.img'}"` : `containerDisk:\n            image: "${imageType === 'preset' ? (image === 'ubuntu-22.04-server-cloudimg-amd64' ? 'quay.io/containerdisks/ubuntu:22.04' : image === 'debian-12-generic-amd64' ? 'quay.io/containerdisks/debian:12' : image === 'rhel-8-server-cloudimg' ? 'quay.io/containerdisks/centos-stream:8' : 'quay.io/containerdisks/fedora:38') : (customImageUrl || 'quay.io/containerdisks/fedora:latest')}"`}`;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="glass-panel p-5 rounded-2xl flex items-center justify-between border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">GDC Virtual Machine Runtime</h2>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-500/30">
                KubeVirt API v1
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Deploy and orchestrate virtual machines alongside Kubernetes containers on GDC Connected Servers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTerminalTarget({ name: `${projectId || 'vdc-18818'}-cluster-1-node-1`, type: 'node' })}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-sm font-semibold border border-emerald-500/30 transition shadow-lg shadow-emerald-500/10"
          >
            <Terminal className="w-4 h-4" />
            <span>SSH Node-1</span>
          </button>
          <button
            onClick={fetchVms}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowDeployForm(!showDeployForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Deploy Virtual Machine</span>
          </button>
        </div>
      </div>

      {deployMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          deployMessage.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{deployMessage.type === 'success' ? '✅' : '❌'}</span>
            <span>{deployMessage.text}</span>
          </div>
          <button onClick={() => setDeployMessage(null)} className="text-xs opacity-70 hover:opacity-100 underline">Dismiss</button>
        </div>
      )}

      {/* Deploy Form Modal/Drawer */}
      {showDeployForm && (
        <div className="glass-panel p-6 rounded-2xl border-2 border-indigo-500/40 shadow-2xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Configure Virtual Machine Custom Resource (`VirtualMachine`)
            </h3>
            <button
              onClick={() => setShowYamlPreview(!showYamlPreview)}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-indigo-300 border border-slate-700 transition"
            >
              <Code className="w-3.5 h-3.5" />
              {showYamlPreview ? 'Hide YAML Manifest' : 'Preview YAML Manifest'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">VM Name</label>
              <input
                type="text"
                value={vmName}
                onChange={(e) => setVmName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Target Namespace</label>
              <select
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="gdc-vms">gdc-vms (Recommended VM Runtime)</option>
                <option value="default">default (General purpose)</option>
                <option value="edge-ai">edge-ai (AI & Inference Workloads)</option>
                <option value="production">production (High availability)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">vCPU Cores</label>
              <select
                value={cpus}
                onChange={(e) => setCpus(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={2}>2 vCPU Cores</option>
                <option value={4}>4 vCPU Cores</option>
                <option value={8}>8 vCPU Cores</option>
                <option value={16}>16 vCPU Cores (High Perf)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Memory</label>
              <select
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="4Gi">4 GB Memory</option>
                <option value="8Gi">8 GB Memory</option>
                <option value="16Gi">16 GB Memory</option>
                <option value="32Gi">32 GB Memory</option>
                <option value="64Gi">64 GB Memory</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Image Source Mode</label>
              <select
                value={imageType}
                onChange={(e) => setImageType(e.target.value as any)}
                className="w-full bg-slate-900 border border-indigo-500/60 text-indigo-300 font-semibold rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                <option value="preset">📦 Preset OS Catalog</option>
                <option value="custom-url">🌐 HTTP/S Disk URL (.qcow2 / .img)</option>
                <option value="custom-registry">🐳 Container Registry Disk (Quay / GCR)</option>
              </select>
            </div>

            {imageType === 'preset' ? (
              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Select Preset OS Catalog Image</label>
                <select
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="ubuntu-22.04-server-cloudimg-amd64">Ubuntu 22.04 LTS (CloudImg)</option>
                  <option value="debian-12-generic-amd64">Debian 12 Bookworm Generic</option>
                  <option value="rhel-8-server-cloudimg">RHEL 8 Server Enterprise</option>
                  <option value="rocky-linux-9-generic">Rocky Linux 9 Cloud</option>
                </select>
              </div>
            ) : (
              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">
                  {imageType === 'custom-url' ? '🌐 HTTP/S Disk Download URL (.qcow2, .raw, or cloud-init image)' : '🐳 Container Registry Disk URL (without docker:// prefix)'}
                </label>
                <input
                  type="text"
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  placeholder={imageType === 'custom-url' ? 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.disk-kvm.img' : 'quay.io/containerdisks/fedora:latest'}
                  className="w-full bg-slate-950 border-2 border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-400"
                />
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                <span>VLAN Network (Multus)</span>
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
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

          {showYamlPreview && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-indigo-300 overflow-x-auto">
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
            >
              {deploying && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Apply VM to GDC Cluster</span>
            </button>
          </div>
        </div>
      )}

      {activeTrackerVm && (
        <div className="mb-8">
          <VmDeploymentTracker
            vmName={activeTrackerVm.name}
            namespace={activeTrackerVm.namespace}
            clusterName={clusterName}
            projectId={projectId}
            onClose={() => setActiveTrackerVm(null)}
            onOpenConsole={(name, namespace) => {
              setActiveTrackerVm(null);
              setTerminalTarget({ name, type: 'vm', namespace });
            }}
          />
        </div>
      )}

      {/* VMs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vms.map((vm, idx) => {
          const isRunning = vm.powerState === 'Running' || vm.status === 'Running';
          return (
            <div key={idx} className="glass-panel-interactive rounded-2xl p-6 border border-slate-800 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                      isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}>
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base truncate max-w-[180px]">{vm.name}</h3>
                      <span className="text-xs text-slate-400 font-mono">ns: {vm.namespace}</span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                    isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {isRunning ? <Play className="w-3 h-3 fill-current" /> : <Square className="w-3 h-3 fill-current" />}
                    {vm.status}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">vCPU Cores</span>
                    <span className="font-semibold text-slate-200">{vm.cpus} vCPU</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">RAM Allocation</span>
                    <span className="font-semibold text-slate-200">{vm.memory}</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-800">
                    <span className="text-slate-500 block">Internal VXLAN IP</span>
                    <span className="font-mono text-indigo-400">{vm.ip}</span>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5 truncate">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate">{vm.image}</span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handlePowerToggle(vm.name)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    isRunning
                      ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                  }`}
                >
                  {isRunning ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isRunning ? 'Power Off' : 'Power On'}</span>
                </button>

                <button
                  onClick={() => setTerminalTarget({ name: vm.name, type: 'vm', namespace: vm.namespace })}
                  className="p-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition border border-slate-700 flex items-center gap-1.5 text-xs font-medium"
                  title="SSH into VM Console"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>SSH</span>
                </button>

                <button
                  onClick={() => handleDelete(vm.name)}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition border border-rose-500/20"
                  title="Delete VM"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Web Terminal Modal */}
      {terminalTarget && (
        <WebTerminalModal
          isOpen={!!terminalTarget}
          onClose={() => setTerminalTarget(null)}
          targetType={terminalTarget.type}
          targetName={terminalTarget.name}
          namespace={terminalTarget.namespace}
          projectId={projectId || 'vdc-18818'}
        />
      )}
    </div>
  );
}
