import { NextResponse } from 'next/server';
import { fetchClusterStatus } from '@/lib/k8s-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clusterName = searchParams.get('clusterName') || undefined;
  const projectId = searchParams.get('projectId') || undefined;
  
  const status = await fetchClusterStatus(clusterName, projectId);
  return NextResponse.json(status);
}
