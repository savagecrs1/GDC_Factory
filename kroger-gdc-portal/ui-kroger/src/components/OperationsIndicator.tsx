'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Loader2, CheckCircle2, XCircle, ArrowRight, ExternalLink } from 'lucide-react';

interface ActiveJob {
  id: string;
  status: 'idle' | 'running' | 'success' | 'failed';
  currentStep: string;
  params?: {
    projectId: string;
    clusterName: string;
  };
}

interface OperationsData {
  active: ActiveJob[];
  recent: ActiveJob[];
  totalCount: number;
  activeCount: number;
}

interface OperationsIndicatorProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSelectJobId?: (jobId: string) => void;
}

export default function OperationsIndicator({
  activeTab,
  setActiveTab,
  onSelectJobId
}: OperationsIndicatorProps) {
  const [data, setData] = useState<OperationsData>({ active: [], recent: [], totalCount: 0, activeCount: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchOperations = () => {
    fetch('/api/infrastructure/operations')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error);
  };

  useEffect(() => {
    fetchOperations();
    const interval = setInterval(fetchOperations, 5000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigateToJob = (jobId: string) => {
    setIsOpen(false);
    if (onSelectJobId) {
      onSelectJobId(jobId);
    }
    // Set localStorage so the Provisioner tab knows to load this specific job log file
    localStorage.setItem('active_provision_job_id', jobId);
    setActiveTab('provision');
  };

  const hasActive = data.active.length > 0;

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold tracking-wide transition-all duration-200 ${
          hasActive
            ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-md shadow-blue-500/5'
            : 'bg-slate-900/60 hover:bg-slate-900 text-slate-400 border-slate-800'
        }`}
      >
        {hasActive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
        ) : (
          <Activity className="w-3.5 h-3.5 text-slate-500" />
        )}
        <span>
          {hasActive ? `${data.active.length} Running` : 'Idle'}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-4 z-[100] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">Operations Console</h4>
            <span className="text-[10px] text-slate-500 font-bold">{data.totalCount} Total Jobs</span>
          </div>

          {/* Running Jobs */}
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {hasActive ? (
              data.active.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleNavigateToJob(job.id)}
                  className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:border-blue-400/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="truncate max-w-[200px]">
                      <span className="text-[10px] font-bold text-blue-400 font-mono block truncate">
                        {job.params?.clusterName || job.id}
                      </span>
                      <span className="text-[9px] text-slate-500 block truncate">{job.params?.projectId}</span>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition" />
                  </div>
                  <div className="mt-1.5 text-[10px] text-slate-300 truncate font-medium">
                    {job.currentStep}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-slate-500 text-xs font-medium">
                No active operations running.
              </div>
            )}
          </div>

          {/* Recent History */}
          {data.recent.length > 0 && (
            <div className="mt-4 border-t border-slate-800/80 pt-3">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                Recent Operations
              </span>
              <div className="space-y-1.5">
                {data.recent.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => handleNavigateToJob(job.id)}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950/80 cursor-pointer text-xs transition"
                  >
                    <span className="font-mono text-[9px] text-slate-400 truncate max-w-[150px]">
                      {job.params?.clusterName || job.id}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {job.status === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span className="text-[9px] text-slate-500 font-bold uppercase">{job.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
