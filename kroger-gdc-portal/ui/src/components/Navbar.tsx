'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Cloud, Server, Cpu, LogOut, Terminal, Layers, Activity, RefreshCw, Network, Bot, GitBranch } from 'lucide-react';
import ProjectSelector from '@/components/ProjectSelector';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  clusterName: string;
  setClusterName: (name: string) => void;
  projectId: string;
  setProjectId: (id: string) => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  clusterName,
  setClusterName,
  projectId,
  setProjectId,
}: NavbarProps) {
  const [auth, setAuth] = useState<any>(null);
  const [isEditingEnv, setIsEditingEnv] = useState(false);

  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => setAuth(data))
      .catch(console.error);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: Activity },
    { id: 'provision', label: 'Cluster Provisioner', icon: Terminal },
    { id: 'vms', label: 'GDC VM Runtime', icon: Cpu },
    { id: 'workloads', label: 'K8s Workloads', icon: Layers },
    { id: 'networks', label: 'VLAN & PCI Networks', icon: Network },
    { id: 'configsync', label: 'GitOps Config Sync', icon: GitBranch },
    { id: 'sentinel', label: 'AI Sentinel Engine', icon: Bot },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800 px-4 md:px-8 py-4 mb-6 shadow-lg">
      <div className="w-full flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <div className="h-16 flex items-center justify-center pr-1">
            <img src="/kroger-logo.svg" alt="Kroger" className="h-14 md:h-16 w-auto object-contain drop-shadow-md" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5 font-sans">
                GDC Virtual Factory <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">Kroger Tech SO</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">Automated Retail Store Workload & VM Operations Portal</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Auth & Environment Switcher */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3 border-r border-slate-800 pr-4">
            <div className="w-48">
              <ProjectSelector projectId={projectId} setProjectId={setProjectId} />
            </div>
            {isEditingEnv ? (
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-700">
                <input
                  type="text"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="Cluster Name"
                  className="w-28 bg-slate-800 text-xs text-white px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-sky-400"
                />
                <button
                  onClick={() => setIsEditingEnv(false)}
                  className="bg-sky-500 text-white text-xs px-2 py-1 rounded font-medium hover:bg-sky-400"
                >
                  Save
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingEnv(true)}
                className="cursor-pointer group flex flex-col items-end"
                title="Click to edit cluster name"
              >
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-semibold group-hover:text-sky-300">
                  <Server className="w-3.5 h-3.5" />
                  <span>{clusterName}</span>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-300">
                  Click to rename cluster
                </span>
              </div>
            )}
          </div>

          {/* User Badge */}
          {auth?.user && (
            <div className="flex items-center gap-3 bg-slate-900/90 py-1.5 px-3 rounded-xl border border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                GDC
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold text-white flex items-center gap-1">
                  {auth.user.name.split(' ')[0]}
                  <span title="OAuth 2.0 / ADC Authenticated">
                    <Shield className="w-3 h-3 text-emerald-400" />
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{auth.user.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
