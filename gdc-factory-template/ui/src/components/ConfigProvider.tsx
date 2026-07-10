'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface PortalConfig {
  customerName: string;
  logoUrl: string;
  primaryHex: string;
  colorMode: 'dark' | 'light';
  operatingMode: 'emulate' | 'argolis' | 'live';
  industryVertical: 'retail' | 'robotics' | 'telecom' | 'custom';
  enabledTabs: string[];
}

interface ConfigContextType {
  config: PortalConfig;
  updateConfig: (newConfig: Partial<PortalConfig>) => Promise<void>;
  loading: boolean;
}

const DEFAULT_CONFIG: PortalConfig = {
  customerName: "GDC Edge Operations",
  logoUrl: "",
  primaryHex: "#38bdf8",
  colorMode: "dark",
  operatingMode: "live",
  industryVertical: "retail",
  enabledTabs: ["dashboard", "provision", "vms", "workloads", "networks", "configsync", "performance", "sentinel"]
};

const ConfigContext = createContext<ConfigContextType>({
  config: DEFAULT_CONFIG,
  updateConfig: async () => {},
  loading: false,
});

export const usePortalConfig = () => useContext(ConfigContext);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PortalConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const applyThemeToDom = (cfg: PortalConfig) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', cfg.primaryHex || '#38bdf8');
    if (cfg.colorMode === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/portal/config');
      const data = await res.json();
      setConfig(data);
      applyThemeToDom(data);
    } catch (err) {
      console.error('Failed to load portal config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const updateConfig = async (newConfig: Partial<PortalConfig>) => {
    const merged = { ...config, ...newConfig };
    setConfig(merged);
    applyThemeToDom(merged);
    try {
      await fetch('/api/portal/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (err) {
      console.error('Failed to save portal config:', err);
    }
  };

  return (
    <ConfigContext.Provider value={{ config, updateConfig, loading }}>
      {children}
    </ConfigContext.Provider>
  );
}
