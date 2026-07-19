'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Terminal, X, Play } from 'lucide-react';

interface VmDeploymentTrackerProps {
  vmName: string;
  namespace: string;
  clusterName: string;
  projectId?: string;
  onClose: () => void;
  onOpenConsole: (name: string, namespace: string) => void;
}

export default function VmDeploymentTracker({
  vmName,
  namespace,
  clusterName,
  projectId,
  onClose,
  onOpenConsole
}: VmDeploymentTrackerProps) {
  const [statusData, setStatusData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const url = `/api/kubernetes/vms/status?vmName=${encodeURIComponent(vmName)}&namespace=${encodeURIComponent(namespace)}&clusterName=${encodeURIComponent(clusterName)}` +
          (projectId ? `&projectId=${encodeURIComponent(projectId)}` : '');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch status');
        const data = await res.json();
        
        setStatusData(data);
        if (data.isReady) {
          setPolling(false);
        }
      } catch (err: any) {
        setError(err.message || 'Error tracking deployment');
      }
    };

    fetchStatus();
    if (polling) {
      intervalId = setInterval(fetchStatus, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [vmName, namespace, clusterName, projectId, polling]);

  if (error) {
    return (
      <div className="p-6 bg-slate-900 border border-red-500/30 rounded-xl max-w-lg mx-auto shadow-2xl">
        <div className="flex items-center gap-3 text-red-400 mb-4">
          <AlertCircle className="h-6 w-6" />
          <h3 className="font-bold text-lg">Deployment Tracking Failed</h3>
        </div>
        <p className="text-slate-300 text-sm mb-4">{error}</p>
        <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm">
          Close Tracker
        </button>
      </div>
    );
  }

  const isReady = statusData?.isReady || false;
  const dv = statusData?.dataVolume;
  const launcher = statusData?.launcherPod;
  const vmStatus = statusData?.vmStatus || 'Starting';

  // Calculate overall steps
  const steps = [
    { label: 'VM Custom Resource Provisioned', desc: 'Object registered with control plane', status: 'done' },
    {
      label: dv ? 'Disk Volume Ingestion (CDI)' : 'Launcher Container Pulling',
      desc: dv 
        ? `Phase: ${dv.phase} (${dv.progress})`
        : launcher 
          ? `Status: ${launcher.status}` 
          : 'Scheduling pod...',
      status: isReady 
        ? 'done' 
        : dv 
          ? (dv.phase === 'Succeeded' ? 'done' : 'running')
          : (launcher && launcher.status === 'Running' ? 'done' : 'running')
    },
    {
      label: 'Hypervisor / QEMU Initializing',
      desc: launcher ? `Launcher pod: ${launcher.name}` : 'Awaiting scheduling...',
      status: isReady 
        ? 'done' 
        : (launcher && launcher.status === 'Running' ? 'running' : 'todo')
    },
    {
      label: 'Virtual Machine Ready',
      desc: isReady ? 'Guest OS online & console ready' : 'Waiting for guest boot...',
      status: isReady ? 'done' : 'todo'
    }
  ];

  return (
    <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl max-w-xl w-full mx-auto animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-start mb-6">
        <div>
          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded border border-emerald-500/25 uppercase tracking-wide">
            {statusData?.source === 'simulation' ? 'Simulated Deploy' : 'Live Deploy'}
          </span>
          <h2 className="text-xl font-bold text-slate-100 mt-1.5 flex items-center gap-2">
            {!isReady && <RefreshCw className="h-5 w-5 text-indigo-400 animate-spin" />}
            {isReady && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            Deploying {vmName}
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Namespace: <code className="text-indigo-300">{namespace}</code> | Cluster: <code className="text-indigo-300">{clusterName}</code>
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress Steps */}
      <div className="space-y-6 mb-6">
        {steps.map((step, idx) => {
          const isDone = step.status === 'done';
          const isRunning = step.status === 'running';
          return (
            <div key={idx} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isDone 
                    ? 'bg-emerald-500 text-slate-950' 
                    : isRunning 
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' 
                      : 'bg-slate-800 text-slate-400'
                }`}>
                  {isDone ? '✓' : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-0.5 h-10 my-1 ${isDone ? 'bg-emerald-500/50' : 'bg-slate-800'}`} />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <h4 className={`text-sm font-semibold transition-colors ${isDone ? 'text-slate-300' : isRunning ? 'text-slate-100' : 'text-slate-500'}`}>
                  {step.label}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                {isRunning && dv && dv.phase !== 'Succeeded' && (
                  <div className="mt-2 w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: dv.progress }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Launcher Pod Events logs */}
      {launcher?.events && launcher.events.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 mb-6">
          <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Recent Deployment Events</h4>
          <div className="space-y-1.5 max-h-24 overflow-y-auto font-mono text-[10px] text-slate-300">
            {launcher.events.map((evt: string, i: number) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-500">•</span>
                <span>{evt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center gap-3">
        <button 
          onClick={onClose} 
          className="px-4 py-2 border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900 rounded-xl text-sm transition-colors"
        >
          Close & Run in Background
        </button>
        <button
          disabled={!isReady}
          onClick={() => onOpenConsole(vmName, namespace)}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold shadow-lg transition-all ${
            isReady 
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 hover:scale-[1.02] active:scale-[0.98]' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Terminal className="h-4 w-4" />
          Connect via Console
        </button>
      </div>
    </div>
  );
}
