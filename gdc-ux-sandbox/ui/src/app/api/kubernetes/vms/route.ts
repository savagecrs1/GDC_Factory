import { NextResponse } from 'next/server';
import { getK8sConfig, getMockVms, saveMockVms, addAuditLog } from '@/lib/k8s-client';
import * as k8s from '@kubernetes/client-node';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clusterName = searchParams.get('clusterName') || undefined;
  const projectId = searchParams.get('projectId') || undefined;
  const kc = getK8sConfig(clusterName, projectId);

  if (!kc) {
    return NextResponse.json({ vms: getMockVms(), source: 'simulation' });
  }

  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const res: any = await customApi.listClusterCustomObject({ group: 'kubevirt.io', version: 'v1', plural: 'virtualmachines' } as any);
    const vms = (res.items || res.body?.items || []).map((v: any) => ({
      name: v.metadata?.name,
      namespace: v.metadata?.namespace,
      status: v.status?.printableStatus || 'Running',
      cpus: v.spec?.template?.spec?.domain?.cpu?.cores || 2,
      memory: v.spec?.template?.spec?.domain?.resources?.requests?.memory || '4Gi',
      ip: '10.240.1.x',
      image: v.spec?.template?.spec?.volumes?.[0]?.dataVolume?.name || 'custom-image',
      uptime: 'Live',
      powerState: v.spec?.running ? 'Running' : 'Stopped',
      rawYaml: JSON.stringify(v, null, 2)
    })) || [];
    return NextResponse.json({ vms: vms.length ? vms : getMockVms(), source: 'live' });
  } catch (err) {
    return NextResponse.json({ vms: getMockVms(), source: 'simulation-fallback' });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, namespace = 'default', cpus = 2, memory = '4Gi', image, imageType = 'preset', action, clusterName, projectId } = body;
    const kc = getK8sConfig(clusterName, projectId);

    const currentVms = getMockVms();

    if (action === 'power-toggle') {
      const targetVm = currentVms.find((v) => v.name === name);
      if (targetVm) {
        targetVm.powerState = targetVm.powerState === 'Running' ? 'Stopped' : 'Running';
        targetVm.status = targetVm.powerState;
        saveMockVms(currentVms);
      }
      if (kc) {
        try {
          const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
          const isRunning = targetVm?.powerState === 'Running';
          await customApi.patchNamespacedCustomObject({ group: 'kubevirt.io', version: 'v1', namespace, plural: 'virtualmachines', name, body: [{ op: 'replace', path: '/spec/running', value: isRunning }] } as any);
        } catch (e) {
          console.warn('Could not patch live VM power state:', e);
        }
      }
      addAuditLog('Power Toggle', name, `Toggled VM power state to ${targetVm?.powerState}`, 'info');
      return NextResponse.json({ success: true, message: `VM ${name} power toggled to ${targetVm?.powerState}` });
    }

    if (action === 'delete') {
      const idx = currentVms.findIndex((v) => v.name === name);
      if (idx !== -1) {
        currentVms.splice(idx, 1);
        saveMockVms(currentVms);
      }
      if (kc) {
        try {
          const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
          await customApi.deleteNamespacedCustomObject({ group: 'kubevirt.io', version: 'v1', namespace, plural: 'virtualmachines', name } as any);
        } catch (e) {
          console.warn('Could not delete live VM object:', e);
        }
      }
      addAuditLog('Delete VM', name, `Deleted VM from namespace ${namespace}`, 'info');
      return NextResponse.json({ success: true, message: `VM ${name} deleted successfully` });
    }

    const PRESET_CONTAINER_DISKS: Record<string, string> = {
      'ubuntu-22.04-server-cloudimg-amd64': 'quay.io/containerdisks/ubuntu:22.04',
      'debian-12-generic-amd64': 'quay.io/containerdisks/debian:12',
      'rhel-8-server-cloudimg': 'quay.io/containerdisks/centos-stream:8',
      'rocky-linux-9-generic': 'quay.io/containerdisks/fedora:38'
    };

    const diskImageUrl = imageType === 'preset' ? (PRESET_CONTAINER_DISKS[image] || 'quay.io/containerdisks/ubuntu:22.04') : image;

    // Create new VM
    const newVm = {
      name: name || `gdc-vm-${Math.random().toString(36).substring(2, 7)}`,
      namespace,
      status: 'Running',
      cpus: Number(cpus),
      memory,
      ip: `10.240.1.${Math.floor(Math.random() * 150) + 50}`,
      image: imageType === 'preset' ? (image || 'ubuntu-22.04-server-cloudimg-amd64') : `Custom (${image})`,
      uptime: 'Just started',
      powerState: 'Running'
    };

    currentVms.unshift(newVm);
    saveMockVms(currentVms);

    if (kc) {
      try {
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
        const vmManifest: any = {
          apiVersion: 'kubevirt.io/v1',
          kind: 'VirtualMachine',
          metadata: { name: newVm.name, namespace: newVm.namespace },
          spec: {
            running: true,
            template: {
              metadata: { labels: { 'gdc.google.com/vm': newVm.name } },
              spec: {
                domain: {
                  cpu: { cores: newVm.cpus },
                  resources: { requests: { memory: newVm.memory } },
                  devices: { disks: [{ name: 'datavolume-disk', disk: { bus: 'virtio' } }] }
                },
                volumes: [
                  imageType === 'custom-url'
                    ? { name: 'datavolume-disk', dataVolume: { name: `${newVm.name}-dv` } }
                    : { name: 'datavolume-disk', containerDisk: { image: diskImageUrl } }
                ]
              }
            }
          }
        };

        if (imageType === 'custom-url') {
          vmManifest.spec.dataVolumeTemplates = [
            {
              metadata: { name: `${newVm.name}-dv` },
              spec: {
                pvc: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '20Gi' } } },
                source: { http: { url: image } }
              }
            }
          ];
        }

        await customApi.createNamespacedCustomObject({ group: 'kubevirt.io', version: 'v1', namespace, plural: 'virtualmachines', body: vmManifest } as any);
      } catch (err) {
        console.warn('Could not create live VM object, saved to emulated state:', err);
      }
    }

    addAuditLog('Deploy VM', newVm.name, `Created VM in ${namespace} with ${cpus} vCPU and ${memory} RAM`, 'success');
    return NextResponse.json({ success: true, vm: newVm, message: `VM ${newVm.name} deployed to GDC environment!` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to deploy VM' }, { status: 500 });
  }
}
