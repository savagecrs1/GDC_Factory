import { NextResponse } from 'next/server';
import { executeAutoRemediate, updateTriageStatus, clearTriageReports } from '@/lib/ai-watchdog';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, id, status } = body;

    if (action === 'clear') {
      clearTriageReports();
      return NextResponse.json({ success: true, message: 'All active triage reports cleared.' });
    }

    if (!id) {
      return NextResponse.json({ error: 'Triage Report ID is required.' }, { status: 400 });
    }

    if (action === 'remediate') {
      const res = executeAutoRemediate(id);
      if (res.success) {
        return NextResponse.json({ success: true, message: res.message, output: res.output });
      } else {
        return NextResponse.json({ error: res.message }, { status: 500 });
      }
    } else if (action === 'update' && status) {
      const updated = updateTriageStatus(id, status);
      if (updated) {
        return NextResponse.json({ success: true, message: `Triage report status updated to ${status}.` });
      } else {
        return NextResponse.json({ error: 'Report ID not found.' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Invalid action or missing parameters.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Triage API error' }, { status: 500 });
  }
}
