'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Dashboard from '@/components/Dashboard';
import ProvisionWizard from '@/components/ProvisionWizard';
import VmManager from '@/components/VmManager';
import WorkloadManager from '@/components/WorkloadManager';
import NetworkManager from '@/components/NetworkManager';
import SentinelManager from '@/components/SentinelManager';
import ConfigSyncManager from '@/components/ConfigSyncManager';
import PerformanceDashboard from '@/components/PerformanceDashboard';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projectId, setProjectId] = useState('core-edge-dm1');
  const [clusterName, setClusterName] = useState('abm-cluster-1');

  // Dynamically discover clusters whenever projectId changes
  useEffect(() => {
    fetch(`/api/gcp/clusters?projectId=${encodeURIComponent(projectId)}`)
      .then(res => res.json())
      .then(data => {
        if (data.clusters && data.clusters.length > 0) {
          setClusterName(data.clusters[0]);
        }
      })
      .catch(console.error);
  }, [projectId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-sky-500 selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clusterName={clusterName}
        setClusterName={setClusterName}
        projectId={projectId}
        setProjectId={setProjectId}
      />

      <main className="w-full max-w-[1920px] mx-auto px-4 md:px-8 lg:px-12 space-y-6 py-8">
        {activeTab === 'dashboard' && (
          <Dashboard clusterName={clusterName} projectId={projectId} setActiveTab={setActiveTab} />
        )}
        {activeTab === 'provision' && (
          <ProvisionWizard
            projectId={projectId}
            setProjectId={setProjectId}
            clusterName={clusterName}
            setClusterName={setClusterName}
          />
        )}
        {activeTab === 'vms' && <VmManager clusterName={clusterName} projectId={projectId} />}
        {activeTab === 'workloads' && <WorkloadManager clusterName={clusterName} projectId={projectId} />}
        {activeTab === 'networks' && <NetworkManager clusterName={clusterName} projectId={projectId} />}
        {activeTab === 'configsync' && <ConfigSyncManager clusterName={clusterName} projectId={projectId} />}
        {activeTab === 'performance' && <PerformanceDashboard clusterName={clusterName} projectId={projectId} />}
        {activeTab === 'sentinel' && <SentinelManager clusterName={clusterName} projectId={projectId} />}
      </main>
    </div>
  );
}
