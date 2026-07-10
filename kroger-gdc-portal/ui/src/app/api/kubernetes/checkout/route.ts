import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

const KROGER_CATALOG = [
  { sku: "000111104285", name: "Kroger Gallon Whole Milk", price: 3.29 },
  { sku: "000111108421", name: "Private Selection Honey Turkey", price: 7.49 },
  { sku: "000111101923", name: "Honeycrisp Apples (3 lbs)", price: 5.99 },
  { sku: "000111109912", name: "Kroger Large Eggs 18ct", price: 3.89 },
  { sku: "000111105512", name: "Private Selection Sumatran Coffee", price: 8.99 },
  { sku: "000111103341", name: "Simple Truth Organic Baby Spinach", price: 3.49 },
  { sku: "000111107762", name: "Kroger Sharp Cheddar Cheese Block", price: 2.99 },
  { sku: "000111102214", name: "Heritage Farm Chicken Breast (3lb)", price: 9.99 },
  { sku: "000111106631", name: "Kroger Creamy Peanut Butter (40oz)", price: 4.29 },
  { sku: "000111108899", name: "Private Selection Sourdough Bread", price: 3.99 },
  { sku: "000111104412", name: "Simple Truth Organic Almond Milk", price: 3.79 },
  { sku: "000111101102", name: "Kroger Frozen Strawberries (16oz)", price: 2.79 },
  { sku: "000111109001", name: "Kroger Pure Olive Oil (32oz)", price: 11.49 },
  { sku: "000111103399", name: "Private Selection Sea Salt Caramel Ice Cream", price: 5.49 },
  { sku: "000111107123", name: "Kroger Paper Towels (6 Mega Rolls)", price: 8.49 }
];

function generateLaneReceipt(laneIndex: number, baseItemCount: number, clusterName: string) {
  // Vary item count slightly per lane in concurrent mode
  const variance = Math.floor((Math.random() - 0.5) * 4);
  const count = Math.max(1, Math.min(50, baseItemCount + variance));
  const isSco = laneIndex >= 6; // Lanes 1-6 Assisted, 7+ Self-Checkout
  const laneName = isSco ? `SCO #${String(laneIndex + 1).padStart(2, '0')} (Self-Checkout)` : `Register #${String(laneIndex + 1).padStart(2, '0')} (Assisted)`;

  const items = [];
  let subtotal = 0;
  for (let i = 0; i < count; i++) {
    const catalogItem = KROGER_CATALOG[(laneIndex * 3 + i) % KROGER_CATALOG.length];
    const itemPrice = Number((catalogItem.price + ((laneIndex % 3) * 0.25)).toFixed(2));
    items.push({
      sku: `${catalogItem.sku}-${i + 1}`,
      name: catalogItem.name,
      price: `$${itemPrice.toFixed(2)}`
    });
    subtotal += itemPrice;
  }

  const tax = Number((subtotal * 0.07).toFixed(2));
  const totalPaid = Number((subtotal + tax).toFixed(2));

  // Per-lane latency metrics
  const posScanTimeMs = Number((count * (1.6 + Math.random() * 0.6)).toFixed(1));
  const pciTokenizationMs = Number((28 + Math.random() * 16).toFixed(1));
  const dukptHandshakeMs = Number((10 + Math.random() * 6).toFixed(1));
  const totalLatencyMs = Number((posScanTimeMs + pciTokenizationMs + dukptHandshakeMs).toFixed(1));

  return {
    lane_id: isSco ? `SCO-${String(laneIndex + 1).padStart(2, '0')}` : `REG-${String(laneIndex + 1).padStart(2, '0')}`,
    lane_name: laneName,
    lane_type: isSco ? "Self-Checkout (SCO)" : "Attended Register",
    status: "APPROVED",
    item_count: count,
    latency_ms: totalLatencyMs,
    pos_scan_ms: posScanTimeMs,
    pci_token_ms: pciTokenizationMs,
    dukpt_ms: dukptHandshakeMs,
    receipt: {
      transaction_id: `POS_TX_2026_${Math.floor(10000 + Math.random() * 90000)}_${laneIndex + 1}`,
      store: `${clusterName} (Hybrid PCI Edge)`,
      vlan_source: `Non-PCI Store Ops VLAN 3130 -> Pod elera-lane-${laneIndex + 1}`,
      cashier: laneName,
      items,
      subtotal: `$${subtotal.toFixed(2)}`,
      tax: `$${tax.toFixed(2)}`,
      total_paid: `$${totalPaid.toFixed(2)}`,
      payment_gateway_response: {
        status: "APPROVED",
        auth_code: `EMV_${Math.floor(100000 + Math.random() * 900000)}`,
        terminal: `VERIFONE_M400_LANE${String(laneIndex + 1).padStart(2, '0')}_VLAN3430`,
        merchant: "KROGER_STORE_002",
        network_segment: "VLAN 3430 CDE Isolated (172.18.0.0/16)",
        pci_encryption: "DUKPT Point-to-Point Validated (AES-256)",
        timestamp: new Date().toISOString()
      }
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    const { clusterName = 'kroger-store-002', projectId = 'kroger-test-2', itemCount = 12, laneCount = 6 } = await req.json();
    const count = Math.max(1, Math.min(50, Number(itemCount) || 12));
    const lanesToSimulate = Math.max(1, Math.min(24, Number(laneCount) || 6));

    const lanes = [];
    let totalLatencySum = 0;
    let maxLatency = 0;
    let totalItemsScanned = 0;
    let totalRevenue = 0;

    for (let l = 0; l < lanesToSimulate; l++) {
      const laneData = generateLaneReceipt(l, count, clusterName);
      lanes.push(laneData);
      totalLatencySum += laneData.latency_ms;
      if (laneData.latency_ms > maxLatency) maxLatency = laneData.latency_ms;
      totalItemsScanned += laneData.item_count;
      const amountNum = parseFloat(laneData.receipt.total_paid.replace('$', ''));
      totalRevenue += amountNum;
    }

    const avgLatencyMs = Number((totalLatencySum / lanesToSimulate).toFixed(1));
    const p95LatencyMs = Number((maxLatency * 0.96).toFixed(1));
    const aggregateTps = Math.floor((lanesToSimulate * 1000) / avgLatencyMs * 4);

    // Dynamic node telemetry scaling with lane concurrency
    const cpuLoad1 = Math.min(95, Math.floor(18 + (lanesToSimulate * 3.2) + Math.random() * 8));
    const cpuLoad2 = Math.min(92, Math.floor(14 + (lanesToSimulate * 2.8) + Math.random() * 6));
    const cpuLoad3 = Math.min(98, Math.floor(25 + (lanesToSimulate * 2.5) + Math.random() * 10));

    const nodeMetrics = [
      {
        node: `${clusterName}-node-1`,
        role: `POS Commerce Engine (${lanesToSimulate} Lane Pods on VLAN 3130)`,
        cpuUsage: `${cpuLoad1}%`,
        cpuCores: `${Math.floor(cpuLoad1 * 80)}m / 8000m`,
        memoryUsage: `${Math.min(85, Math.floor(22 + (lanesToSimulate * 1.8)))}%`,
        memoryBytes: `${(7.1 + (lanesToSimulate * 0.45)).toFixed(1)} GiB / 32 GiB`,
        networkIo: `${(1.2 + (lanesToSimulate * 0.8)).toFixed(1)} MB/s`,
        podHealth: `100% (${lanesToSimulate}/${lanesToSimulate} Lane Pods Ready)`
      },
      {
        node: `${clusterName}-node-2`,
        role: `PIN Pad DUKPT Gateway (${lanesToSimulate} Terminals on VLAN 3430)`,
        cpuUsage: `${cpuLoad2}%`,
        cpuCores: `${Math.floor(cpuLoad2 * 80)}m / 8000m`,
        memoryUsage: `${Math.min(80, Math.floor(18 + (lanesToSimulate * 1.4)))}%`,
        memoryBytes: `${(5.8 + (lanesToSimulate * 0.35)).toFixed(1)} GiB / 32 GiB`,
        networkIo: `${(0.8 + (lanesToSimulate * 0.6)).toFixed(1)} MB/s`,
        podHealth: `100% (${lanesToSimulate}/${lanesToSimulate} Gateway Endpoints Ready)`
      },
      {
        node: `${clusterName}-node-3`,
        role: "Smart Cart Vision & Storage (TopoLVM)",
        cpuUsage: `${cpuLoad3}%`,
        cpuCores: `${Math.floor(cpuLoad3 * 80)}m / 8000m`,
        memoryUsage: `${Math.min(90, Math.floor(35 + (lanesToSimulate * 1.2)))}%`,
        memoryBytes: `${(11.2 + (lanesToSimulate * 0.3)).toFixed(1)} GiB / 32 GiB`,
        networkIo: `${(3.5 + (lanesToSimulate * 1.1)).toFixed(1)} MB/s`,
        podHealth: "100% (1/1 Ready)"
      }
    ];

    return NextResponse.json({
      success: true,
      lanes,
      selectedLaneIndex: 0,
      metrics: {
        avgLatencyMs,
        p95LatencyMs,
        maxLatencyMs: maxLatency,
        totalLanes: lanesToSimulate,
        totalItemsScanned,
        totalRevenue: `$${totalRevenue.toFixed(2)}`,
        tpsRate: aggregateTps
      },
      nodeMetrics
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
