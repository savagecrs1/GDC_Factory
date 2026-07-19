import { NextResponse } from 'next/server';
import { getK8sConfig } from '@/lib/k8s-client';
import * as k8s from '@kubernetes/client-node';

export const dynamic = 'force-dynamic';

// Keep track of simulated progress in memory per VM for mock testing
const simulatedProgress: Record<string, { progress: number; phase: string; step: number }> = {};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vmName = searchParams.get('vmName');
  const namespace = searchParams.get('namespace') || 'default';
  const clusterName = searchParams.get('clusterName') || undefined;
  const projectId = searchParams.get('projectId') || undefined;

  if (!vmName) {
    return NextResponse.json({ error: 'vmName is required' }, { status: 400 });
  }

  const kc = getK8sConfig(clusterName, projectId);

  // --- SIMULATION MODE ---
  if (!kc) {
    if (!simulatedProgress[vmName]) {
      simulatedProgress[vmName] = { progress: 0, phase: 'Pending', step: 0 };
    }

    const state = simulatedProgress[vmName];
    if (state.step === 0) {
      state.progress = 15;
      state.phase = 'Disk Downloading';
      state.step = 1;
    } else if (state.step === 1) {
      state.progress = 50;
      state.phase = 'Disk Importing';
      state.step = 2;
    } else if (state.step === 2) {
      state.progress = 80;
      state.phase = 'Launcher Pod Scheduling';
      state.step = 3;
    } else {
      state.progress = 100;
      state.phase = 'Running';
    }

    return NextResponse.json({
      source: 'simulation',
      vmExists: true,
      vmStatus: state.phase === 'Running' ? 'Running' : 'Starting',
      isReady: state.progress === 100,
      dataVolume: {
        name: `${vmName}-dv`,
        phase: state.step < 3 ? 'ImportInProgress' : 'Succeeded',
        progress: `${state.progress}%`
      },
      launcherPod: {
        name: `virt-launcher-${vmName}-sim`,
        status: state.step >= 3 ? 'Running' : 'Pending',
        events: state.step < 3 ? ['Scheduled on node-2', 'Pulling CDI image'] : ['Started container compute']
      }
    });
  }

  // --- LIVE KUBERNETES MODE ---
  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    // 1. Get VM object
    let vmObj: any = null;
    try {
      vmObj = await customApi.getNamespacedCustomObject({
        group: 'kubevirt.io',
        version: 'v1',
        namespace,
        plural: 'virtualmachines',
        name: vmName
      });
    } catch (e) {
      return NextResponse.json({ vmExists: false, message: `VM ${vmName} not found` });
    }

    const spec = vmObj?.spec || {};
    const status = vmObj?.status || {};
    const printableStatus = status.printableStatus || 'Starting';
    const isReady = status.ready || false;

    // 2. Check if a DataVolume is defined
    const hasDataVolume = spec.template?.spec?.volumes?.some((v: any) => v.dataVolume);
    let dvStatus = null;

    if (hasDataVolume) {
      const dvName = `${vmName}-dv`;
      try {
        const dvObj: any = await customApi.getNamespacedCustomObject({
          group: 'cdi.kubevirt.io',
          version: 'v1beta1',
          namespace,
          plural: 'datavolumes',
          name: dvName
        });
        dvStatus = {
          name: dvName,
          phase: dvObj?.status?.phase || 'Unknown',
          progress: dvObj?.status?.progress || '0%'
        };
      } catch (dvErr) {
        dvStatus = { name: dvName, phase: 'NotCreatedYet', progress: '0%' };
      }
    }

    // 3. Find launcher pod status & events
    let launcherPod = null;
    try {
      const podsRes = await coreApi.listNamespacedPod({
        namespace,
        labelSelector: `kubevirt.io/domain=${vmName}`
      });
      const pods = podsRes.items || [];
      if (pods.length > 0) {
        const pod = pods[0];
        launcherPod = {
          name: pod.metadata?.name,
          status: pod.status?.phase || 'Pending',
          reason: pod.status?.containerStatuses?.[0]?.state?.waiting?.reason || null,
          message: pod.status?.containerStatuses?.[0]?.state?.waiting?.message || null,
          events: [] as string[]
        };

        // Fetch last 3 pod events
        try {
          const eventsRes = await coreApi.listNamespacedEvent({
            namespace,
            fieldSelector: `involvedObject.name=${pod.metadata?.name}`
          });
          const events = eventsRes.items || [];
          launcherPod.events = events
            .sort((a, b) => {
              const aTime = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
              const bTime = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
              return bTime - aTime;
            })
            .slice(0, 3)
            .map((e) => e.message || '');
        } catch (eventErr) {
          // Ignore event query failures
        }
      }
    } catch (podErr) {
      // Ignore pod query failures
    }

    return NextResponse.json({
      source: 'live',
      vmExists: true,
      vmStatus: printableStatus,
      isReady: isReady,
      dataVolume: dvStatus,
      launcherPod
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to query VM status' }, { status: 500 });
  }
}
