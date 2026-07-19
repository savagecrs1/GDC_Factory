'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Cloud, Server, Cpu, LogOut, Terminal, Layers, Activity, RefreshCw, Network, Bot, GitBranch } from 'lucide-react';
import ProjectSelector from '@/components/ProjectSelector';
import OperationsIndicator from '@/components/OperationsIndicator';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  clusterName: string;
  setClusterName: (name: string) => void;
  projectId: string;
  setProjectId: (id: string) => void;
  onSelectJobId?: (jobId: string) => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  clusterName,
  setClusterName,
  projectId,
  setProjectId,
  onSelectJobId,
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
    { id: 'fleet', label: 'Fleet Hub', icon: Server },
    { id: 'provision', label: 'Cluster Provisioner', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800 px-4 md:px-8 lg:px-12 py-3.5 mb-6 shadow-lg">
      <div className="w-full max-w-[1920px] mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                Google Distributed Cloud <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-medium border border-sky-500/30">Hybrid SO</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">Virtual Environment Workload & VM Portal</p>
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
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Auth, Operations Indicator & Environment Switcher */}
        <div className="flex items-center gap-4">
          <OperationsIndicator activeTab={activeTab} setActiveTab={setActiveTab} onSelectJobId={onSelectJobId} />
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
                onClick={() => { if (clusterName) setIsEditingEnv(true); }}
                className="cursor-pointer group flex flex-col items-end"
                title={clusterName ? "Click to edit cluster name" : "No cluster active"}
              >
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-semibold group-hover:text-sky-300">
                  <Server className="w-3.5 h-3.5" />
                  <span>{clusterName || 'Select a Cluster'}</span>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-300">
                  {clusterName ? 'Click to rename cluster' : 'Go to Fleet Hub to select'}
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

      {/* Unauthenticated Warning Banner */}
      {auth && auth.authenticated === false && (
        <div className="bg-amber-950/90 border-b border-amber-500/50 px-4 py-2.5 text-xs text-amber-100 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-amber-400 shrink-0 font-bold" />
            <span className="leading-snug">
              <strong className="text-white font-bold">GCP Authentication Required:</strong> No active <code className="text-amber-300 font-bold">gcloud</code> session found on host. Please run 
              <code className="bg-slate-950 text-amber-400 border border-amber-500/40 px-2.5 py-0.5 rounded-md mx-1 font-mono font-bold text-[11px] shadow-sm">gcloud auth login && gcloud auth application-default login</code> 
              in your terminal.
            </span>
          </div>
          <button 
            onClick={() => fetch('/api/auth').then(res => res.json()).then(setAuth)}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
          >
            <RefreshCw className="w-3 h-3" /> Re-check Auth
          </button>
        </div>
      )}
    </header>
  );
}
