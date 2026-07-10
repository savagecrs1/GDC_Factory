import { NextRequest, NextResponse } from 'next/server';

const ENTERPRISE_CATALOG = [
  { upc: "000111104285", name: "Enterprise Gallon Whole Milk", price: 3.29, category: "Dairy", promo: null },
  { upc: "000111108421", name: "Private Selection Honey Turkey", price: 7.49, category: "Deli", promo: "Enterprise Plus Card: -$1.50 Off" },
  { upc: "000111101923", name: "Honeycrisp Apples (3 lbs)", price: 5.99, category: "Produce", promo: null },
  { upc: "000111109912", name: "Enterprise Large Eggs 18ct", price: 3.89, category: "Dairy", promo: "Digital Coupon: -$0.50 Off" },
  { upc: "000111105512", name: "Private Selection Sumatran Coffee", price: 8.99, category: "Grocery", promo: "Buy 1 Get 1 50% Off" },
  { upc: "000111103341", name: "Simple Truth Organic Baby Spinach", price: 3.49, category: "Produce", promo: null },
  { upc: "000111107762", name: "Enterprise Sharp Cheddar Cheese Block", price: 2.99, category: "Dairy", promo: null },
  { upc: "000111102214", name: "Heritage Farm Chicken Breast (3lb)", price: 9.99, category: "Meat", promo: "Mega Sale: -$2.00 Off" },
  { upc: "000111106631", name: "Enterprise Creamy Peanut Butter (40oz)", price: 4.29, category: "Grocery", promo: null },
  { upc: "000111108899", name: "Private Selection Sourdough Bread", price: 3.99, category: "Bakery", promo: null },
  { upc: "000111104412", name: "Simple Truth Organic Almond Milk", price: 3.79, category: "Dairy", promo: null },
  { upc: "000111101102", name: "Enterprise Frozen Strawberries (16oz)", price: 2.79, category: "Frozen", promo: "Digital Coupon: -$0.30 Off" },
  { upc: "000111109001", name: "Enterprise Pure Olive Oil (32oz)", price: 11.49, category: "Grocery", promo: null },
  { upc: "000111103399", name: "Private Selection Sea Salt Caramel Ice Cream", price: 5.49, category: "Frozen", promo: null },
  { upc: "000111107123", name: "Enterprise Paper Towels (6 Mega Rolls)", price: 8.49, category: "Household", promo: "Enterprise Plus Card: -$1.00 Off" }
];

function generateLaneLifecycle(laneIndex: number, baseItemCount: number, clusterName: string) {
  const variance = Math.floor((Math.random() - 0.5) * 4);
  const count = Math.max(1, Math.min(50, baseItemCount + variance));
  const isSco = laneIndex >= 6;
  const laneName = isSco ? `SCO #${String(laneIndex + 1).padStart(2, '0')} (Self-Checkout)` : `Register #${String(laneIndex + 1).padStart(2, '0')} (Assisted)`;
  const laneId = isSco ? `SCO-${String(laneIndex + 1).padStart(2, '0')}` : `REG-${String(laneIndex + 1).padStart(2, '0')}`;

  const items = [];
  const promotionsApplied = [];
  let rawSubtotal = 0;
  let promoDiscountTotal = 0;

  for (let i = 0; i < count; i++) {
    const catalogItem = ENTERPRISE_CATALOG[(laneIndex * 3 + i) % ENTERPRISE_CATALOG.length];
    const itemPrice = Number((catalogItem.price + ((laneIndex % 3) * 0.15)).toFixed(2));
    
    // Simulate cashier scanning time per item (350ms to 750ms in real life)
    const scanDelayMs = Math.floor(350 + Math.random() * 400);
    
    let itemPromo = null;
    if (catalogItem.promo && (i % 2 === 0 || laneIndex % 2 === 0)) {
      const discountVal = catalogItem.promo.includes('-$') 
        ? parseFloat(catalogItem.promo.split('-$')[1].split(' ')[0]) 
        : Number((itemPrice * 0.25).toFixed(2));
      
      itemPromo = {
        description: catalogItem.promo,
        discount: Number(discountVal.toFixed(2))
      };
      promoDiscountTotal += discountVal;
      promotionsApplied.push({ upc: catalogItem.upc, name: catalogItem.name, promo: catalogItem.promo, saved: `$${discountVal.toFixed(2)}` });
    }

    items.push({
      sequence: i + 1,
      upc: catalogItem.upc,
      name: catalogItem.name,
      category: catalogItem.category,
      unit_price: `$${itemPrice.toFixed(2)}`,
      scan_duration_ms: scanDelayMs,
      promo: itemPromo
    });
    rawSubtotal += itemPrice;
  }

  const netSubtotal = Math.max(0.01, Number((rawSubtotal - promoDiscountTotal).toFixed(2)));
  const tax = Number((netSubtotal * 0.07).toFixed(2));
  const totalPaid = Number((netSubtotal + tax).toFixed(2));

  // Granular transaction lifecycle step timings
  const totalScanTimeMs = items.reduce((acc, it) => acc + it.scan_duration_ms, 0);
  const promoReconcileMs = Math.floor(250 + Math.random() * 200);
  const dukptTokenizationMs = Math.floor(450 + Math.random() * 350);
  const tenderCloseoutMs = Math.floor(180 + Math.random() * 120);
  const totalE2eMs = totalScanTimeMs + promoReconcileMs + dukptTokenizationMs + tenderCloseoutMs;

  return {
    lane_id: laneId,
    lane_name: laneName,
    lane_type: isSco ? "Self-Checkout (SCO)" : "Attended Cashier Register",
    status: "APPROVED",
    item_count: count,
    timings: {
      total_e2e_ms: totalE2eMs,
      upc_scan_total_ms: totalScanTimeMs,
      promo_reconcile_ms: promoReconcileMs,
      dukpt_tokenization_ms: dukptTokenizationMs,
      tender_closeout_ms: tenderCloseoutMs
    },
    lifecycle_stream: items,
    promotions: promotionsApplied,
    receipt: {
      transaction_id: `POS_TX_2026_${Math.floor(10000 + Math.random() * 90000)}_${laneIndex + 1}`,
      store: `${clusterName} (Hybrid PCI Edge)`,
      vlan_source: `Non-PCI Store Ops VLAN 3130 -> Pod elera-${laneId.toLowerCase()}`,
      cashier: laneName,
      items,
      raw_subtotal: `$${rawSubtotal.toFixed(2)}`,
      promo_savings: promoDiscountTotal > 0 ? `-$${promoDiscountTotal.toFixed(2)}` : "$0.00",
      net_subtotal: `$${netSubtotal.toFixed(2)}`,
      tax: `$${tax.toFixed(2)}`,
      total_paid: `$${totalPaid.toFixed(2)}`,
      payment_gateway_response: {
        status: "APPROVED",
        auth_code: `EMV_${Math.floor(100000 + Math.random() * 900000)}`,
        terminal: `VERIFONE_M400_${laneId}_VLAN3430`,
        merchant: "GDC_STORE_001",
        network_segment: "VLAN 3430 CDE Isolated (172.18.0.0/16)",
        pci_encryption: "DUKPT Point-to-Point Validated (AES-256)",
        timestamp: new Date().toISOString()
      }
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    const { clusterName = 'gdc-edge-cluster-1', projectId = 'gdc-edge-demo-1', itemCount = 12, laneCount = 6 } = await req.json();
    const count = Math.max(1, Math.min(50, Number(itemCount) || 12));
    const lanesToSimulate = Math.max(1, Math.min(24, Number(laneCount) || 6));

    const lanes = [];
    let totalE2eSum = 0;
    let maxE2e = 0;
    let totalItemsScanned = 0;
    let totalRevenue = 0;
    let totalPromoSavings = 0;

    for (let l = 0; l < lanesToSimulate; l++) {
      const laneData = generateLaneLifecycle(l, count, clusterName);
      lanes.push(laneData);
      totalE2eSum += laneData.timings.total_e2e_ms;
      if (laneData.timings.total_e2e_ms > maxE2e) maxE2e = laneData.timings.total_e2e_ms;
      totalItemsScanned += laneData.item_count;
      totalRevenue += parseFloat(laneData.receipt.total_paid.replace('$', ''));
      if (laneData.receipt.promo_savings !== "$0.00") {
        totalPromoSavings += parseFloat(laneData.receipt.promo_savings.replace('-$', ''));
      }
    }

    const avgE2eMs = Number((totalE2eSum / lanesToSimulate).toFixed(0));
    const p95E2eMs = Number((maxE2e * 0.96).toFixed(0));
    const aggregateTps = Math.floor((lanesToSimulate * 1000) / (avgE2eMs / count) * 2);

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
        avgE2eMs,
        p95E2eMs,
        maxE2eMs: maxE2e,
        totalLanes: lanesToSimulate,
        totalItemsScanned,
        totalRevenue: `$${totalRevenue.toFixed(2)}`,
        totalPromoSavings: `$${totalPromoSavings.toFixed(2)}`,
        tpsRate: aggregateTps
      },
      nodeMetrics
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
