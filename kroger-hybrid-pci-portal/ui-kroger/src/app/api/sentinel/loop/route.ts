import { NextResponse } from 'next/server';
import { startSentinelLoop, stopSentinelLoop, clearSentinelLoop, getSentinelState } from '@/lib/sentinel-engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, projectId = 'kroger-store-test1', clusterName = 'sentinel-test-cluster', iterations = 3, billingAccountId = '0150AE-F3AB84-9BC087' } = body;

    if (action === 'start') {
      startSentinelLoop(projectId, clusterName, iterations, billingAccountId).catch((err) => {
        console.error(`Sentinel background loop exception for ${projectId}-${clusterName}:`, err);
      });
      return NextResponse.json({ success: true, message: `Concurrent loop started for ${projectId}.`, ...getSentinelState() });
    } else if (action === 'stop') {
      stopSentinelLoop(projectId, clusterName);
      return NextResponse.json({ success: true, message: `Concurrent loop stopped for ${projectId}.`, ...getSentinelState() });
    } else if (action === 'clear') {
      clearSentinelLoop(projectId, clusterName);
      return NextResponse.json({ success: true, message: `Concurrent loop cleared for ${projectId}.`, ...getSentinelState() });
    }

    return NextResponse.json({ error: 'Invalid action. Must be start, stop, or clear.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to manage Sentinel loop' }, { status: 500 });
  }
}
