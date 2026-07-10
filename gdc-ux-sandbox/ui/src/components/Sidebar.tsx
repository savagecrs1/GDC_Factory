'use client';

import React, { useState } from 'react';
import { 
  Activity, Cpu, Server, Shield, Terminal, Layers, Network, 
  GitBranch, BarChart3, Bot, ChevronLeft, ChevronRight, Zap, 
  CheckCircle2, HardDrive 
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  clusterName: string;
}

export default function Sidebar({ activeTab, setActiveTab, clusterName }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Fleet Overview', icon: Activity, badge: 'HOME' },
    { id: 'provision', label: 'Cluster Provisioner', icon: Terminal },
    { id: 'vms', label: 'GDC VM Runtime', icon: Cpu, badge: 'OCI' },
    { id: 'workloads', label: 'K8s Workloads', icon: Layers },
    { id: 'networks', label: 'VLAN & Secondary Nets', icon: Network },
    { id: 'configsync', label: 'GitOps Config Sync', icon: GitBranch },
    { id: 'performance', label: 'Performance & Metrics', icon: BarChart3 },
    { id: 'sentinel', label: 'AI Sentinel Watchdog', icon: Bot, badge: 'AI' },
  ];

  return (
    <aside
      className={`glass-panel border-r border-slate-800 flex flex-col justify-between transition-all duration-300 relative z-40 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950 h-screen sticky top-0 flex-shrink-0 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center shadow-md hover:scale-110 transition z-50"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      <div className="p-4 space-y-6 overflow-y-auto flex-1 min-h-0">
        {/* Navigation Header */}
        <div className={`flex items-center gap-3 px-2 py-1 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-purple-500/20">
            GDC
          </div>
          {!isCollapsed && (
            <div>
              <div className="font-extrabold text-white text-xs tracking-wider uppercase">Console Navigation</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[140px]">{clusterName}</div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600/90 to-indigo-600/90 text-white shadow-lg shadow-purple-500/20 border border-purple-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>
                {!isCollapsed && item.badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-purple-400 group-hover:bg-slate-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Integrated Resource Allocation Meter */}
      <div className={`p-4 border-t border-slate-800/80 bg-slate-950/90 flex-shrink-0 ${isCollapsed ? 'px-2' : ''}`}>
        {!isCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Cluster Allocation</span>
              </span>
              <span className="text-emerald-400 text-[10px]">100% Healthy</span>
            </div>

            <div className="space-y-2 text-[10px]">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>vCPU Allocation (24/32)</span>
                  <span className="text-white font-mono font-bold">75%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 w-3/4 rounded-full animate-pulse" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>RAM In-Use (96/128 GB)</span>
                  <span className="text-white font-mono font-bold">75%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 w-3/4 rounded-full" />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Active KubeVirt VMs:</span>
              <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">6 VMs / 3 Nodes</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center" title="75% vCPU & RAM Allocated across 6 VMs">
            <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4 animate-pulse" />
            </div>
            <span className="text-[9px] font-mono font-extrabold text-slate-400">75%</span>
          </div>
        )}
      </div>
    </aside>
  );
}
