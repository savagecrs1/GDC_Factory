import { NextResponse } from 'next/server';
import { getTestHarnessReport, startTestHarnessDaemon, stopTestHarness } from '@/lib/test-harness';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getTestHarnessReport());
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    
    if (body.smtpHost) {
      const config = {
        host: body.smtpHost,
        port: parseInt(body.smtpPort || "587"),
        user: body.smtpUser || "",
        pass: body.smtpPass || "",
        from: body.smtpFrom || "gdc-sentinel-alerts@altostrat.com"
      };
      fs.writeFileSync("/tmp/gdc_smtp_config.json", JSON.stringify(config, null, 2), "utf-8");
    }

    const report = startTestHarnessDaemon(body || {});
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Test Harness error' }, { status: 500 });
  }
}

export async function DELETE() {
  stopTestHarness();
  return NextResponse.json({ success: true, message: "E2E Test Harness aborted." });
}
