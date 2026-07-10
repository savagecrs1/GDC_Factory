import { NextResponse } from 'next/server';
import { getTestHarnessReport, runFullStackTestHarness } from '@/lib/test-harness';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getTestHarnessReport());
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { projectId, clusterName } = body;
    const report = await runFullStackTestHarness(projectId || 'core-edge-dm1', clusterName || 'gdc-e2e-test-1');
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Test Harness error' }, { status: 500 });
  }
}
