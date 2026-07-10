import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(process.cwd(), '..', 'portal.config.json');

const DEFAULT_CONFIG = {
  customerName: "Kroger Retail Edge",
  logoUrl: "",
  primaryHex: "#10b981",
  colorMode: "dark",
  operatingMode: "live",
  industryVertical: "retail",
  enabledTabs: [
    "dashboard",
    "provision",
    "vms",
    "workloads",
    "networks",
    "configsync",
    "performance",
    "sentinel"
  ]
};

export async function GET() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
      return NextResponse.json(DEFAULT_CONFIG);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ...DEFAULT_CONFIG, ...parsed });
  } catch (error: any) {
    console.error('Error reading portal.config.json:', error);
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function POST(req: NextRequest) {
  try {
    const updates = await req.json();
    let current = { ...DEFAULT_CONFIG };
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        current = { ...current, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
      } catch (e) {}
    }
    const newConfig = { ...current, ...updates };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    return NextResponse.json({ success: true, config: newConfig });
  } catch (error: any) {
    console.error('Error saving portal.config.json:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
