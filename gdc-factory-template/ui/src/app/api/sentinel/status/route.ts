import { NextResponse } from 'next/server';
import { getSentinelState } from '@/lib/sentinel-engine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId') || undefined;
  const clusterName = searchParams.get('clusterName') || undefined;
  const { activeLoops, triageReports } = getSentinelState(projectId, clusterName);
  return NextResponse.json({ activeLoops, triageReports });
}
