'use client';

import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Shield, Globe, RefreshCw, AlertCircle, CheckCircle2, Server, Cpu, Activity } from 'lucide-react';

interface NetworkManagerProps {
  clusterName: string;
  projectId?: string;
}

export default function NetworkManager({ clusterName, projectId }: NetworkManagerProps) {
  const [networks, setNetworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [name, setName] = useState('secondary-vlan-100');
  const [vlanId, setVlanId] = useState('100');
  const [subnet, setSubnet] = useState('10.100.0.0/24');
  const [vipPool, setVipPool] = useState('10.100.0.200-10.100.0.250');
  const [purpose, setPurpose] = useState('High-Priority Secondary VLAN Traffic');

  const fetchNetworks = () => {
    setLoading(true);
    const url = `/api/kubernetes/networks?clusterName=${encodeURIComponent(clusterName)}` + (projectId ? `&projectId=${encodeURIComponent(projectId)}` : '');
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setNetworks(data.networks || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchNetworks();
  }, [clusterName, projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !vlanId || !subnet) return;

    setMessage(null);
    try {
      const res = await fetch('/api/kubernetes/networks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          vlanId,
          subnet,
          vipPool,
          purpose,
          clusterName,
          projectId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setShowCreateForm(false);
        fetchNetworks();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create network' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error' });
    }
  };

  const handleDelete = async (netName: string) => {
    if (!confirm(`Are you sure you want to delete VLAN network ${netName}?`)) return;

    setMessage(null);
    try {
      const res = await fetch('/api/kubernetes/networks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: netName,
          action: 'delete',
          clusterName,
          projectId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        fetchNetworks();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete network' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-indigo-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">VLAN & Secondary Network Manager</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Multus L2 Enabled
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Configure strict broadcast domain isolation (`gdcenet0.&lt;VLAN&gt;`) for multi-tenant and secondary workload segmentation in <strong className="text-slate-200">{clusterName}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={fetchNetworks}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            {showCreateForm ? 'Cancel' : 'Create Secondary VLAN'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Create Form Modal/Drawer */}
      {showCreateForm && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 animate-fadeIn space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Create Secondary VLAN Network (GDC Network CRD)
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Standard Edge VLAN Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setName('k8s-default-3030');
                  setVlanId('3030');
                  setSubnet('192.168.120.0/24');
                  setVipPool('10.0.2.0/23 (Internal Pod CIDR)');
                  setPurpose('Primary GKE Control Plane, Kubelet Communication & Master Routing');
                }}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-semibold transition"
              >
                VLAN 3030 (k8s Default)
              </button>
              <button
                type="button"
                onClick={() => {
                  setName('tenant-a-vlan-100');
                  setVlanId('3130');
                  setSubnet('192.168.88.0/24');
                  setVipPool('192.168.88.65-192.168.88.126');
                  setPurpose('Island-Mode Store Ops (Pricing, Inventory, Back-Office)');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                VLAN 100 (Tenant A)
              </button>
              <button
                type="button"
                onClick={() => {
                  setName('tenant-b-vlan-200');
                  setVlanId('3430');
                  setSubnet('192.168.80.0/24');
                  setVipPool('192.168.80.65-192.168.80.126');
                  setPurpose('Cardholder Data Environment (CDE), NGPOS & Fuel Transactions');
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold transition"
              >
                VLAN 200 (Tenant B)
              </button>
            </div>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Network Name (CRD Name)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. secondary-vlan-100"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">VLAN ID (gdcenet0.&lt;VLAN&gt;)</label>
              <input
                type="number"
                value={vlanId}
                onChange={(e) => setVlanId(e.target.value)}
                placeholder="e.g. 100"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Subnet CIDR (IPAM Pool)</label>
              <input
                type="text"
                value={subnet}
                onChange={(e) => setSubnet(e.target.value)}
                placeholder="e.g. 10.100.0.0/24"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">MetalLB Floating VIP Pool</label>
              <input
                type="text"
                value={vipPool}
                onChange={(e) => setVipPool(e.target.value)}
                placeholder="e.g. 10.100.0.200-10.100.0.250"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Purpose & Compliance Scope</label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Dedicated secondary VLAN overlay"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition"
              >
                Create VLAN & Multus Binding
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Networks Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Configured Secondary Networks (Multus Overlay)
          </h3>
          <span className="text-xs font-mono text-slate-500">Total: {networks.length} VLANs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-mono text-[11px] uppercase">
                <th className="p-4">Network CRD Name</th>
                <th className="p-4">VLAN ID / Interface</th>
                <th className="p-4">Subnet CIDR</th>
                <th className="p-4">VIP Pool</th>
                <th className="p-4">Purpose / Scope</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {networks.map((net: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition">
                  <td className="p-4 font-semibold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>{net.name}</span>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-sky-300 font-semibold">
                      {net.iface || `gdcenet0.${net.vlanId}`}
                    </span>
                    <span className="text-slate-500 ml-2">(VLAN {net.vlanId})</span>
                  </td>
                  <td className="p-4 text-emerald-400">{net.subnet}</td>
                  <td className="p-4 text-purple-300">{net.vipPool}</td>
                  <td className="p-4 text-slate-300 font-sans text-xs">{net.purpose}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                      {net.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDelete(net.name)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition border border-rose-500/20"
                      title="Delete Network"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {networks.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                    No secondary VLANs configured yet. Click "Create Secondary VLAN" above to attach a Multus L2 network.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
