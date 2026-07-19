import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/deployment-runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jobs = getAllJobs();
  const active = jobs.filter(j => j.status === 'running');
  const recent = jobs.filter(j => j.status !== 'running').slice(-5);
  return NextResponse.json({
    active,
    recent,
    totalCount: jobs.length,
    activeCount: active.length
  });
}
