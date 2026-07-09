import { NextResponse } from 'next/server';
import { getK8sConfig, addAuditLog } from '@/lib/k8s-client';
import * as k8s from '@kubernetes/client-node';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const NETWORKS_FILE = path.join('/tmp', 'gdc_secondary_networks.json');

const DEFAULT_NETWORKS = [
  {
    name: 'k8s-default-3030',
    vlanId: '3030',
    subnet: '192.168.120.0/24',
    vipPool: '10.0.2.0/23 (Internal Pod CIDR)',
    purpose: 'Primary GKE Control Plane, Kubelet Communication & Master Routing',
    status: 'Active',
    iface: 'vxlan0'
  },
  {
    name: 'non-pci-network-3130',
    vlanId: '3130',
    subnet: '192.168.88.0/24',
    vipPool: '192.168.88.65-192.168.88.126',
    purpose: 'Island-Mode Store Ops (Pricing, Inventory, Back-Office)',
    status: 'Active',
    iface: 'gdcenet0.3130'
  },
  {
    name: 'pci-network-3430',
    vlanId: '3430',
    subnet: '192.168.80.0/24',
    vipPool: '192.168.80.65-192.168.80.126',
    purpose: 'Cardholder Data Environment (CDE), NGPOS & Fuel Transactions',
    status: 'Active',
    iface: 'gdcenet0.3430'
  },
];

export function getStoredNetworks(): any[] {
  try {
    if (fs.existsSync(NETWORKS_FILE)) {
      return JSON.parse(fs.readFileSync(NETWORKS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not read secondary networks file:', e);
  }
  return DEFAULT_NETWORKS;
}

export function saveStoredNetworks(networks: any[]) {
  try {
    fs.writeFileSync(NETWORKS_FILE, JSON.stringify(networks, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write secondary networks file:', e);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clusterName = searchParams.get('clusterName') || undefined;
  const projectId = searchParams.get('projectId') || undefined;
  const kc = getK8sConfig(clusterName, projectId);

  const stored = getStoredNetworks();

  if (!kc) {
    return NextResponse.json({ networks: stored, source: 'simulation' });
  }

  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const res: any = await customApi.listClusterCustomObject({ group: 'networking.gke.io', version: 'v1', plural: 'networks' } as any);
    const liveNetworks = (res.items || res.body?.items || []).map((n: any) => ({
      name: n.metadata?.name,
      vlanId: n.metadata?.annotations?.['networking.gke.io/gdce-vlan-id'] || 'N/A',
      subnet: n.spec?.l2NetworkConfig?.prefixLength4 ? `Subnet /${n.spec?.l2NetworkConfig?.prefixLength4}` : 'Custom Subnet',
      vipPool: n.spec?.gateway4 ? `Gateway: ${n.spec?.gateway4}` : 'Auto-assigned Pool',
      purpose: n.metadata?.name?.includes('pci') ? 'PCI-DSS Regulated Workload Traffic' : 'Secondary VLAN Overlay',
      status: 'Active',
      iface: n.spec?.nodeInterfaceMatcher?.interfaceName || `gdcenet0.${n.metadata?.annotations?.['networking.gke.io/gdce-vlan-id']}`
    }));
    return NextResponse.json({ networks: liveNetworks.length ? liveNetworks : stored, source: 'live' });
  } catch (err) {
    return NextResponse.json({ networks: stored, source: 'simulation-fallback' });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, vlanId, subnet, vipPool, purpose, action, clusterName, projectId } = body;
    const kc = getK8sConfig(clusterName, projectId);
    const stored = getStoredNetworks();

    if (action === 'delete') {
      const idx = stored.findIndex((n) => n.name === name);
      if (idx !== -1) {
        stored.splice(idx, 1);
        saveStoredNetworks(stored);
      }
      if (kc) {
        try {
          const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
          await customApi.deleteClusterCustomObject({ group: 'networking.gke.io', version: 'v1', plural: 'networks', name } as any);
        } catch (e) {
          console.warn('Could not delete live network object:', e);
        }
      }
      addAuditLog('Delete VLAN', name, `Removed secondary network interface gdcenet0.${vlanId || name}`, 'info');
      return NextResponse.json({ success: true, message: `VLAN ${name} deleted successfully` });
    }

    // Create new network
    if (!name || !vlanId || !subnet) {
      return NextResponse.json({ error: 'Name, VLAN ID, and Subnet CIDR are required' }, { status: 400 });
    }

    const newNet = {
      name,
      vlanId,
      subnet,
      vipPool: vipPool || 'Auto-allocated pool',
      purpose: purpose || 'Secondary VLAN Workload Traffic',
      status: 'Active',
      iface: `gdcenet0.${vlanId}`
    };

    stored.push(newNet);
    saveStoredNetworks(stored);

    if (kc) {
      try {
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
        const manifest = {
          apiVersion: 'networking.gke.io/v1',
          kind: 'Network',
          metadata: {
            name,
            annotations: {
              'networking.gke.io/gdce-vlan-id': String(vlanId),
              'networking.gke.io/gdce-vlan-mtu': '1410'
            }
          },
          spec: {
            type: 'L2',
            IPAMMode: 'Internal',
            nodeInterfaceMatcher: {
              interfaceName: `gdcenet0.${vlanId}`
            },
            gateway4: subnet.split('/')[0].replace(/\.\d+$/, '.1'),
            l2NetworkConfig: {
              prefixLength4: Number(subnet.split('/')[1] || 24)
            }
          }
        };
        await customApi.createClusterCustomObject({ group: 'networking.gke.io', version: 'v1', plural: 'networks', body: manifest } as any);
      } catch (err) {
        console.warn('Could not create live network object, saved to emulated state:', err);
      }
    }

    addAuditLog('Create VLAN', name, `Created secondary network gdcenet0.${vlanId} (${subnet})`, 'success');
    return NextResponse.json({ success: true, network: newNet, message: `VLAN ${name} (gdcenet0.${vlanId}) created successfully!` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to manage network' }, { status: 500 });
  }
}
