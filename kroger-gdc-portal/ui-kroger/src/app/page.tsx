'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Cpu, Layers, Network, GitBranch, Bot, Server, Terminal } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Dashboard from '@/components/Dashboard';
import ProvisionWizard from '@/components/ProvisionWizard';
import VmManager from '@/components/VmManager';
import WorkloadManager from '@/components/WorkloadManager';
import NetworkManager from '@/components/NetworkManager';
import SentinelManager from '@/components/SentinelManager';
import ConfigSyncManager from '@/components/ConfigSyncManager';
import FleetManager from '@/components/FleetManager';

export default function Home() {
  const [activeTab, setActiveTab] = useState('fleet');
  const [projectId, setProjectId] = useState('core-edge-dm1');
  const [clusterName, setClusterName] = useState('');

  // Dynamically discover clusters whenever projectId changes
  useEffect(() => {
    if (!projectId) return;
    setActiveTab('fleet');
    fetch(`/api/gcp/clusters?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.clusters && data.clusters.length > 0) {
          if (!clusterName || !data.clusters.includes(clusterName)) {
            setClusterName(data.clusters[0]);
          }
        } else {
          setClusterName('');
        }
      })
      .catch((err) => console.error('Error discovering project clusters:', err));
  }, [projectId]);

  return (
    <div className="min-h-screen pb-16 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clusterName={clusterName}
        setClusterName={setClusterName}
        projectId={projectId}
        setProjectId={setProjectId}
      />

      <div className="flex flex-1 w-full max-w-[1920px] mx-auto px-4 md:px-8 lg:px-12 gap-6 items-start">
        {/* Render Sidebar only if a cluster context is selected AND we are not in 'fleet' or 'provision' tabs */}
        {clusterName && activeTab !== 'fleet' && activeTab !== 'provision' && (
          <aside className="w-64 flex-shrink-0 glass-panel p-4 rounded-2xl border border-slate-800 h-[calc(100vh-140px)] sticky top-24 space-y-1">
            <div className="px-3 py-2 border-b border-slate-850 mb-3">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Cluster</div>
              <div className="text-xs font-semibold text-sky-400 truncate mt-0.5" title={clusterName}>{clusterName}</div>
            </div>
            {[
              { id: 'dashboard', label: 'Overview Dashboard', icon: Activity },
              { id: 'vms', label: 'GDC VM Runtime', icon: Cpu },
              { id: 'workloads', label: 'K8s Workloads', icon: Layers },
              { id: 'networks', label: 'VLAN & PCI Networks', icon: Network },
              { id: 'configsync', label: 'GitOps Config Sync', icon: GitBranch },
              { id: 'sentinel', label: 'AI Sentinel Engine', icon: Bot },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-500/40 text-white shadow-sm'
                      : 'text-slate-400 border border-transparent hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-4 border-t border-slate-850 mt-4">
              <button
                onClick={() => {
                  setClusterName('');
                  setActiveTab('fleet');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 border border-transparent hover:text-white hover:bg-slate-805/40"
              >
                <Server className="w-4 h-4 text-slate-400" />
                <span>Return to Fleet Hub</span>
              </button>
            </div>
          </aside>
        )}

        {/* Main Content Pane */}
        <main className="flex-1 min-w-0">
          {activeTab === 'fleet' && (
            <FleetManager
              projectId={projectId}
              setProjectId={setProjectId}
              setClusterName={setClusterName}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'dashboard' && (
            <Dashboard clusterName={clusterName} projectId={projectId} setActiveTab={setActiveTab} />
          )}
          {activeTab === 'provision' && (
            <ProvisionWizard
              projectId={projectId}
              setProjectId={setProjectId}
              clusterName={clusterName}
              setClusterName={setClusterName}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'vms' && <VmManager clusterName={clusterName} projectId={projectId} />}
          {activeTab === 'workloads' && <WorkloadManager clusterName={clusterName} projectId={projectId} />}
          {activeTab === 'networks' && <NetworkManager clusterName={clusterName} projectId={projectId} />}
          {activeTab === 'configsync' && <ConfigSyncManager clusterName={clusterName} projectId={projectId} />}
          {activeTab === 'sentinel' && <SentinelManager clusterName={clusterName} projectId={projectId} />}
        </main>
      </div>
    </div>
  );
}
