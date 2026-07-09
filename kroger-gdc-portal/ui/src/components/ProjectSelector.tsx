'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, FolderPlus, Check, RefreshCw, AlertCircle } from 'lucide-react';

interface ProjectSelectorProps {
  projectId: string;
  setProjectId: (id: string) => void;
  className?: string;
  disabled?: boolean;
}

export default function ProjectSelector({ projectId, setProjectId, className = '', disabled = false }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<{ projectId: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New project form state
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchProjects = () => {
    setLoading(true);
    fetch('/api/gcp/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) {
          setProjects(data.projects);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch projects:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId) return;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/gcp/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: newId, name: newName || newId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create project');
      }

      setProjects((prev) => [{ projectId: newId, name: newName || newId }, ...prev]);
      setProjectId(newId);
      setShowCreateModal(false);
      setNewId('');
      setNewName('');
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Dropdown Button */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-xl px-3 py-2 text-xs text-white flex items-center justify-between gap-2 transition focus:outline-none focus:border-sky-400 disabled:opacity-50"
      >
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
          <span className="font-semibold truncate">{projectId || 'Select GCP Project'}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400 flex-shrink-0">
          {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-64 flex flex-col animate-fadeIn">
          <div className="p-2 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/50">
            <span>Available GCP Projects</span>
            <button onClick={fetchProjects} className="hover:text-white flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" /> Refresh
            </button>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-800/40">
            {projects.map((p) => {
              const isSelected = p.projectId === projectId;
              return (
                <button
                  key={p.projectId}
                  type="button"
                  onClick={() => {
                    setProjectId(p.projectId);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2.5 text-left text-xs flex items-center justify-between hover:bg-slate-800 transition ${
                    isSelected ? 'bg-sky-500/10 text-sky-400 font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="truncate font-medium">{p.projectId}</div>
                    {p.name && p.name !== p.projectId && (
                      <div className="text-[10px] text-slate-500 truncate">{p.name}</div>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-sky-400" />}
                </button>
              );
            })}
          </div>

          <div className="p-1.5 border-t border-slate-800 bg-slate-950">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setShowCreateModal(true);
              }}
              className="w-full py-2 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition border border-sky-500/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Project</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Create New GCP Project</h3>
                <p className="text-xs text-slate-400">Provision fresh project in Argolis / GCP</p>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Project ID</label>
                <input
                  type="text"
                  required
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. core-edge-env-01"
                  disabled={creating}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">Must be unique across Google Cloud (lowercase, digits, hyphens).</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name (Optional)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Edge Hybrid Lab 1"
                  disabled={creating}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{createError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newId}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {creating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{creating ? 'Creating in GCP...' : 'Create & Select'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
