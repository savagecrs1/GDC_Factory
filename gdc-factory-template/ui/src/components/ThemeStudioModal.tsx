'use client';

import React, { useState, useEffect } from 'react';
import { usePortalConfig, PortalConfig } from '@/components/ConfigProvider';
import { Sparkles, Palette, Building2, Sliders, CheckCircle2, ShieldAlert, Cloud, Laptop, Server, RefreshCw, X, Eye } from 'lucide-react';

interface ThemeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_THEMES = [
  { label: '🟢 Kroger Emerald', hex: '#10b981', vertical: 'retail' },
  { label: '🟠 Home Depot Orange', hex: '#f97316', vertical: 'retail' },
  { label: '🔴 Target Red', hex: '#ef4444', vertical: 'retail' },
  { label: '🔵 Walmart Blue', hex: '#0071ce', vertical: 'retail' },
  { label: '🌌 Google Cloud Blue', hex: '#4285f4', vertical: 'custom' },
  { label: '🟡 Caterpillar Gold', hex: '#f59e0b', vertical: 'robotics' },
  { label: '🟣 T-Mobile Magenta', hex: '#e1141e', vertical: 'telecom' },
];

const ALL_TABS = [
  { id: 'dashboard', label: 'Overview Dashboard' },
  { id: 'provision', label: 'Cluster Provisioner' },
  { id: 'vms', label: 'GDC VM Runtime' },
  { id: 'workloads', label: 'K8s Workloads' },
  { id: 'networks', label: 'VLAN & PCI Networks' },
  { id: 'configsync', label: 'GitOps Config Sync' },
  { id: 'performance', label: 'Performance & Metrics' },
  { id: 'sentinel', label: 'AI Sentinel Engine' },
];

export default function ThemeStudioModal({ isOpen, onClose }: ThemeStudioModalProps) {
  const { config, updateConfig } = usePortalConfig();
  const [formData, setFormData] = useState<PortalConfig>(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setFormData(config);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateConfig(formData);
    setSaving(false);
    onClose();
  };

  const toggleTab = (tabId: string) => {
    const current = formData.enabledTabs || [];
    if (current.includes(tabId)) {
      setFormData({ ...formData, enabledTabs: current.filter(t => t !== tabId) });
    } else {
      setFormData({ ...formData, enabledTabs: [...current, tabId] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto font-sans">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-500 text-slate-950 font-bold">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                GDC Edge Studio & Customer Portal Generator
                <span className="text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-mono">SE Bootstrapper</span>
              </h3>
              <p className="text-xs text-slate-400">
                Live white-label customization for customer demos, POC kickoffs, and Argolis cloud deployments.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Customer Identity & Branding */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
              <Building2 className="w-4 h-4 text-sky-400" /> 1. Customer Identity & Color Theming
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Customer Company Name</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="e.g., Home Depot Retail Edge"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 transition font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Primary Brand Hex Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.primaryHex}
                    onChange={(e) => setFormData({ ...formData, primaryHex: e.target.value })}
                    className="w-10 h-9 bg-transparent border-0 cursor-pointer rounded"
                  />
                  <input
                    type="text"
                    value={formData.primaryHex}
                    onChange={(e) => setFormData({ ...formData, primaryHex: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* Quick Theme Presets */}
            <div>
              <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Quick SE Brand Presets:</span>
              <div className="flex flex-wrap gap-2">
                {PRESET_THEMES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFormData({ ...formData, primaryHex: preset.hex, industryVertical: preset.vertical as any })}
                    className={`py-1 px-2.5 rounded-lg text-xs font-mono border transition flex items-center gap-1.5 ${
                      formData.primaryHex === preset.hex
                        ? 'bg-slate-800 border-white text-white font-bold shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preset.hex }} />
                    <span>{preset.label.split(' ')[1]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Operating Mode Selector */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
              <Sliders className="w-4 h-4 text-emerald-400" /> 2. Platform Operating Mode
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { id: 'emulate', title: '🎭 Emulate-Only Mode', subtitle: 'Offline Sandbox (No K8s / GCP required)', icon: Laptop, desc: 'Serves synthetic simulation telemetry streams for offline airplane demos.' },
                { id: 'argolis', title: '☁️ Argolis Cloud Sandbox', subtitle: 'Virtual GDC Cluster in GCP', icon: Cloud, desc: 'Uses Terraform & Ansible provisioner to stand up virtual bare-metal VMs in ~25 min.' },
                { id: 'live', title: '🏢 Production Mode', subtitle: 'Physical Bare-Metal Hardware', icon: Server, desc: 'Connects to live customer cluster nodes, local NVMe drives, and GitOps pipelines.' }
              ].map((mode: any) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, operatingMode: mode.id })}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    formData.operatingMode === mode.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 font-bold text-xs text-white">
                      <mode.icon className="w-4 h-4 text-emerald-400" />
                      <span>{mode.title}</span>
                    </div>
                    <span className="text-[10px] text-sky-400 font-mono block mt-1">{mode.subtitle}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Active Module Toggles */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
              <Eye className="w-4 h-4 text-amber-400" /> 3. Active Portal Modules (Customize Navigation)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_TABS.map((tab) => {
                const isEnabled = (formData.enabledTabs || []).includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => toggleTab(tab.id)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-mono transition flex items-center justify-between ${
                      isEnabled
                        ? 'bg-sky-950/40 border-sky-500/50 text-white font-semibold'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-sky-400' : 'bg-slate-700'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center gap-2 transition"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 fill-current" />}
              <span>Apply White-Label Configuration</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
