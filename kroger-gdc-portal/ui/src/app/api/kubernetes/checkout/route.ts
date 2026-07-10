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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const { clusterName = 'kroger-store-002', projectId = 'kroger-test-2', itemCount = 4 } = await req.json();
    const count = Math.max(1, Math.min(50, Number(itemCount) || 4));

    // Generate dynamic item list
    const items = [];
    let subtotal = 0;
    for (let i = 0; i < count; i++) {
      const catalogItem = KROGER_CATALOG[i % KROGER_CATALOG.length];
      // Slightly vary price for duplicates
      const itemPrice = Number((catalogItem.price + (Math.floor(i / KROGER_CATALOG.length) * 0.5)).toFixed(2));
      items.push({
        sku: `${catalogItem.sku}-${i + 1}`,
        name: catalogItem.name,
        price: `$${itemPrice.toFixed(2)}`
      });
      subtotal += itemPrice;
    }

    const tax = Number((subtotal * 0.07).toFixed(2));
    const totalPaid = Number((subtotal + tax).toFixed(2));

    // Simulate transaction timing metrics
    const posScanTimeMs = Number((count * (1.8 + Math.random() * 0.8)).toFixed(1));
    const pciTokenizationMs = Number((32 + Math.random() * 18).toFixed(1));
    const dukptHandshakeMs = Number((12 + Math.random() * 8).toFixed(1));
    const totalLatencyMs = Number((posScanTimeMs + pciTokenizationMs + dukptHandshakeMs).toFixed(1));

    // Generate synthetic node telemetry for the 3 bare-metal nodes
    const nodeMetrics = [
      {
        node: `${clusterName}-node-1`,
        role: "POS Commerce Engine (VLAN 3130)",
        cpuUsage: `${Math.floor(18 + Math.random() * 25)}%`,
        cpuCores: "140m / 8000m",
        memoryUsage: `${Math.floor(22 + Math.random() * 15)}%`,
        memoryBytes: "7.1 GiB / 32 GiB",
        networkIo: `${(1.2 + Math.random() * 2.5).toFixed(1)} MB/s`,
        podHealth: "100% (2/2 Ready)"
      },
      {
        node: `${clusterName}-node-2`,
        role: "PIN Pad DUKPT Gateway (VLAN 3430)",
        cpuUsage: `${Math.floor(12 + Math.random() * 18)}%`,
        cpuCores: "95m / 8000m",
        memoryUsage: `${Math.floor(18 + Math.random() * 12)}%`,
        memoryBytes: "5.8 GiB / 32 GiB",
        networkIo: `${(0.8 + Math.random() * 1.5).toFixed(1)} MB/s`,
        podHealth: "100% (2/2 Ready)"
      },
      {
        node: `${clusterName}-node-3`,
        role: "Smart Cart Vision & Storage (TopoLVM)",
        cpuUsage: `${Math.floor(28 + Math.random() * 22)}%`,
        cpuCores: "220m / 8000m",
        memoryUsage: `${Math.floor(35 + Math.random() * 20)}%`,
        memoryBytes: "11.2 GiB / 32 GiB",
        networkIo: `${(3.5 + Math.random() * 4.2).toFixed(1)} MB/s`,
        podHealth: "100% (1/1 Ready)"
      }
    ];

    const receiptJson = {
      transaction_id: `POS_TX_2026_${Math.floor(10000 + Math.random() * 90000)}`,
      store: `${clusterName} (Hybrid PCI Edge)`,
      vlan_source: "Non-PCI Store Ops VLAN 3130 (172.16.0.0/16)",
      cashier: `Register #04 - Simulated Cashier Checkout (${count} items)`,
      items,
      subtotal: `$${subtotal.toFixed(2)}`,
      tax: `$${tax.toFixed(2)}`,
      total_paid: `$${totalPaid.toFixed(2)}`,
      payment_gateway_response: {
        status: "APPROVED",
        auth_code: `EMV_${Math.floor(100000 + Math.random() * 900000)}`,
        terminal: "VERIFONE_M400_PCI_VLAN3430",
        merchant: "KROGER_STORE_002",
        network_segment: "VLAN 3430 CDE Isolated (172.18.0.0/16)",
        pci_encryption: "DUKPT Point-to-Point Validated (AES-256)",
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json({
      success: true,
      receipt: receiptJson,
      metrics: {
        totalLatencyMs,
        posScanTimeMs,
        pciTokenizationMs,
        dukptHandshakeMs,
        itemCount: count,
        tpsRate: Math.floor(1200 / totalLatencyMs)
      },
      nodeMetrics
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
