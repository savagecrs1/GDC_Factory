'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Loader2, Play, RefreshCw, Terminal as TerminalIcon } from 'lucide-react';

interface InteractiveXtermProps {
  targetType: 'node' | 'pod' | 'vm';
  targetName: string;
  namespace?: string;
  projectId?: string;
}

export default function InteractiveXterm({
  targetType,
  targetName,
  namespace = 'default',
  projectId = 'vdc-18818',
}: InteractiveXtermProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const commandRef = useRef<string>('');

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#020617', // slate-950
        foreground: '#e2e8f0', // slate-200
        cursor: '#10b981',     // emerald-500
        selectionBackground: '#334155',
        black: '#0f172a',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
      },
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome banner
    term.writeln(`\x1b[1;32m⚡ GDC Interactive Web Console\x1b[0m`);
    term.writeln(`\x1b[90mConnected to ${targetType.toUpperCase()}: \x1b[36m${targetName}\x1b[90m in namespace \x1b[36m${namespace}\x1b[0m`);
    term.writeln(`\x1b[90mType any command and hit \x1b[1;37mENTER\x1b[0m\x1b[90m to execute securely over IAP tunnel.\x1b[0m`);
    term.writeln('');
    writePrompt(term);

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Key handler
    term.onData(async (data) => {
      if (isExecuting) return;

      const charCode = data.charCodeAt(0);

      if (charCode === 13) {
        // Enter pressed
        const cmd = commandRef.current.trim();
        term.writeln('');
        if (cmd) {
          await executeCommand(cmd, term);
        }
        commandRef.current = '';
        writePrompt(term);
      } else if (charCode === 127) {
        // Backspace
        if (commandRef.current.length > 0) {
          commandRef.current = commandRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (charCode < 32) {
        // Ignore other control characters for simple bash emulator
      } else {
        // Normal printable character
        commandRef.current += data;
        term.write(data);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [targetType, targetName, namespace, projectId]);

  const writePrompt = (term: Terminal) => {
    term.write(`\x1b[1;32mgem@${targetName}\x1b[0m:\x1b[1;34m~\x1b[0m$ `);
  };

  const executeCommand = async (cmd: string, term: Terminal) => {
    setIsExecuting(true);
    term.writeln(`\x1b[90mExecuting over IAP tunnel...\x1b[0m`);

    try {
      const res = await fetch('/api/kubernetes/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetName,
          namespace,
          command: cmd,
          projectId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        term.writeln(`\x1b[37m${data.output}\x1b[0m`);
      } else {
        term.writeln(`\x1b[1;31m${data.output || 'Execution failed.'}\x1b[0m`);
      }
    } catch (err: any) {
      term.writeln(`\x1b[1;31mNetwork error: ${err.message}\x1b[0m`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-slate-200">Interactive xterm.js TTY</span>
          <span>|</span>
          <span className="font-mono text-emerald-400">{targetName}</span>
        </div>
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Streaming IAP Output...</span>
          </div>
        )}
      </div>
      <div ref={terminalRef} className="flex-1 p-3 overflow-hidden" />
    </div>
  );
}
