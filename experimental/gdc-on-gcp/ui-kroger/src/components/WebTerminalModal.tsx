import React, { useState } from 'react';
import { Terminal, X, Play, Copy, Check, CornerDownLeft, ShieldAlert, Sparkles, Loader2, Monitor } from 'lucide-react';
import InteractiveXterm from './InteractiveXterm';

interface WebTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'node' | 'pod' | 'vm';
  targetName: string;
  namespace?: string;
  projectId?: string;
}

interface HistoryItem {
  cmd: string;
  output: string;
  isError?: boolean;
}

export default function WebTerminalModal({
  isOpen,
  onClose,
  targetType,
  targetName,
  namespace = 'default',
  projectId = 'vdc-18818',
}: WebTerminalModalProps) {
  const [command, setCommand] = useState(targetType === 'pod' ? 'env && uname -a' : 'whoami && uptime');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'interactive' | 'quick'>('interactive');

  if (!isOpen) return null;

  const handleRunCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim() || loading) return;

    const currentCmd = command;
    setLoading(true);

    try {
      const res = await fetch('/api/kubernetes/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetName,
          namespace,
          command: currentCmd,
          projectId,
        }),
      });

      const data = await res.json();
      setHistory((prev) => [
        ...prev,
        {
          cmd: currentCmd,
          output: data.output || data.error || 'No output returned.',
          isError: !data.success,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          cmd: currentCmd,
          output: err.message || 'Network error executing command.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      setCommand('');
    }
  };

  const getCliCommand = () => {
    const targetGcpProject = (projectId === 'core-edge-dm1' || !projectId || projectId === 'undefined') ? 'vdc-18818' : projectId;
    const controlPlaneNode = `${targetGcpProject}-cluster-1-node-1`;
    if (targetType === 'node') {
      return `gcloud compute ssh ${targetName} --project=${targetGcpProject} --zone=us-central1-a --tunnel-through-iap`;
    } else if (targetType === 'vm') {
      return `gcloud compute ssh ${controlPlaneNode} --project=${targetGcpProject} --zone=us-central1-a --tunnel-through-iap --command="sudo kubectl --kubeconfig /etc/kubernetes/admin.conf exec -it -n ${namespace} \\$(sudo kubectl --kubeconfig /etc/kubernetes/admin.conf get pod -n ${namespace} -l kubevirt.io/domain=${targetName} -o jsonpath='{.items[0].metadata.name}') -c compute -- /bin/bash"`;
    }
    return `gcloud compute ssh ${controlPlaneNode} --project=${targetGcpProject} --zone=us-central1-a --tunnel-through-iap --command="sudo kubectl --kubeconfig /etc/kubernetes/admin.conf exec -it -n ${namespace} ${targetName} -- /bin/sh"`;
  };

  const copyCliCommand = () => {
    navigator.clipboard.writeText(getCliCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickCommands =
    targetType === 'pod'
      ? ['env', 'ls -la', 'ps aux', 'cat /etc/resolv.conf', 'curl -I http://localhost']
      : ['whoami', 'uptime', 'ip -4 route', 'sudo crictl ps', 'df -h', 'free -m'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        {/* Title Bar */}
        <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  {targetType === 'pod' ? 'Pod Exec Terminal' : 'Node SSH Terminal'}
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {targetName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {targetType === 'pod' ? `Namespace: ${namespace} | Direct kubectl exec` : `GCE IAP Tunnel | Project: ${projectId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 mr-2">
              <button
                onClick={() => setMode('interactive')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  mode === 'interactive' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>xterm.js Interactive</span>
              </button>
              <button
                onClick={() => setMode('quick')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  mode === 'quick' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Quick Runner</span>
              </button>
            </div>

            <button
              onClick={copyCliCommand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
              title="Copy exact raw terminal command to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy CLI'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {mode === 'interactive' ? (
          <div className="flex-1 p-2 bg-slate-950 overflow-hidden">
            <InteractiveXterm
              targetType={targetType}
              targetName={targetName}
              namespace={namespace}
              projectId={projectId}
            />
          </div>
        ) : (
          <>
            {/* Quick Command Chips */}
            <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-semibold text-slate-400 uppercase flex items-center gap-1 flex-shrink-0">
                <Sparkles className="w-3 h-3 text-amber-400" /> Quick Exec:
              </span>
              {quickCommands.map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCommand(cmd);
                  }}
                  className="text-xs font-mono bg-slate-800/80 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 transition flex-shrink-0"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Terminal Screen Area */}
            <div className="flex-1 p-4 bg-slate-950 font-mono text-xs overflow-y-auto space-y-4">
              <div className="text-slate-500 border-b border-slate-900 pb-2">
                Welcome to Antigravity Web Terminal. Connected to <span className="text-emerald-400">{targetName}</span>.
              </div>

              {history.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold">
                    <span>$</span>
                    <span>{item.cmd}</span>
                  </div>
                  <pre
                    className={`p-3 rounded-xl overflow-x-auto whitespace-pre-wrap ${
                      item.isError ? 'bg-rose-950/20 text-rose-300 border border-rose-500/30' : 'bg-slate-900/60 text-slate-200 border border-slate-800'
                    }`}
                  >
                    {item.output}
                  </pre>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-amber-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Executing command over IAP tunnel...</span>
                </div>
              )}
            </div>

            {/* Command Input Footer */}
            <form onSubmit={handleRunCommand} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
              <div className="flex-1 relative flex items-center">
                <span className="absolute left-3 text-emerald-400 font-mono font-bold">$</span>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={`Enter command to run on ${targetName}...`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !command.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                <CornerDownLeft className="w-4 h-4" />
                <span>Run</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
