# GDC Edge Operations Portal – Frontend Architecture & Engineering Elements

This document provides a comprehensive technical reference for the architectural elements, libraries, design systems, and component modules used to build the **Google Distributed Cloud (GDC) Edge Operations Portal**.

---

## 1. Core Technology Stack

The portal is built as a unified full-stack web application designed to run locally on administrative workstations or edge cluster gateway nodes, bridging graphical user interfaces directly with bare-metal command-line infrastructure tools.

| Element | Technology / Version | Purpose |
| :--- | :--- | :--- |
| **Application Framework** | **Next.js 16 (App Router)** | Provides full-stack routing, server-side API endpoints (`/api/...`), static generation, and high-speed compilation via **Turbopack**. |
| **UI Library** | **React 19** | Powers interactive client-side dashboards, real-time state streaming, and reactive hardware telemetry monitors. |
| **Language** | **TypeScript 5+** | Enforces strict type safety across Kubernetes API schemas, Terraform deployment jobs, and microservice metrics envelopes. |
| **Iconography** | **Lucide React** | Scalable vector iconography representing physical hardware nodes, network VLAN overlays, cryptographic gateways, and GitOps pipelines. |
| **System Interoperability** | **Node.js Child Process & Filesystem (`fs`)** | Enables backend API routes to securely execute local shell commands (`gcloud`, `terraform`, `ansible-playbook`, `kubectl`) and stream log files. |

---

## 2. Design System & Visual Aesthetics (`globals.css`)

To achieve a state-of-the-art, premium aesthetic suitable for mission-critical edge operations centers without bloating the bundle size, the frontend avoids heavy utility frameworks (like Tailwind dependencies) and implements a **Curated Vanilla CSS Design System**:

* **Glassmorphism & Surface Hierarchy**: 
  Uses translucent glass panels (`.glass-panel`) with subtle borders (`border-slate-800`), deep backgrounds (`bg-slate-950`), and `backdrop-filter: blur()` to create depth and visual hierarchy.
* **Curated Edge Color Palettes**:
  * 🟢 **Emerald / Teal (`#10b981`, `#0d9488`)**: Denotes healthy bare-metal nodes, active GitOps synchronization, and completed transactions.
  * 🔵 **Sky / Indigo (`#0ea5e9`, `#6366f1`)**: Highlights network VLAN overlays (`3130`, `3430`), ingress routers, and active streaming concurrency.
  * 🟡 **Amber (`#f59e0b`)**: Flags promotional engine processing, disk I/O wait times, and non-fatal pre-flight warnings.
  * 🔴 **Rose (`#f43f5e`)**: Alerts on P99 tail latency spikes, unreachable SSH hosts, and pod crashes.
* **Fluid Micro-Animations**:
  Implements custom `@keyframes animate-fadeIn` and smooth CSS width transitions (`duration-500`) to visualize real-time progress across latency waterfall bars and automated deployment logs.

---

## 3. Frontend Component Architecture

The frontend is modularized into specialized feature components residing in `ui/src/components/`:

```
ui/src/components/
├── Navbar.tsx                 # Top-level navigation bar with dynamic project & cluster discovery
├── ProjectSelector.tsx        # GCP billing account and multi-project scoping selector
├── Dashboard.tsx              # Real-time cluster health overview and hardware telemetry grid
├── ProvisionWizard.tsx        # 5-step automated Terraform & Ansible deployment wizard
├── VmManager.tsx              # KubeVirt / gVirt virtual machine runtime lifecycle management
├── WorkloadManager.tsx        # Kubernetes pod/deployment inspector and live terminal container exec
├── NetworkManager.tsx         # Multus dual-overlay VLAN mapping and SR-IOV network topology
├── ConfigSyncManager.tsx      # GitOps RootSync reconciliation engine with 1-click profile presets
├── PerformanceDashboard.tsx   # Chained microservices performance analyzer and latency waterfall
└── SentinelManager.tsx        # AI Watchdog autonomous triage engine and auto-healing loop
```

---

## 4. Key Component Deep-Dives

### 4.1 `PerformanceDashboard.tsx` (Metrics & Performance Analyzer)
Designed to visualize headless distributed microservice benchmarks (such as the Kroger `isc-utility-project` MongoDB TopoLVM suite):
* **Workload Suite Selector**: Lets engineers switch between POS Commerce lookups, PCI-DSS DUKPT encryption stress tests, TopoLVM NVMe block I/O benchmarks, and multi-VLAN VXLAN throughput tests.
* **Interactive Load Concurrency Slider**: Scales synthetic worker threads from `1` to `32`, dynamically recalculating system throughput (TPS/RPS) and disk/network I/O.
* **4-Stage Latency Waterfall Attribution**: Deconstructs total end-to-end checkout duration into granular visual percentage bars across *Network Overlay Encapsulation*, *CPU Cryptographic Processing*, *Database Catalog Lookup*, and *Storage Block Commit I/O*.
* **AI Engineering Advisor**: Automatically analyzes telemetry ratios in real time and outputs actionable engineering tuning recommendations (e.g. CPU core pinning or 1410 VXLAN MTU clamping verification).

### 4.2 `ProvisionWizard.tsx` (Infrastructure Automation Engine)
Orchestrates complex infrastructure deployments across GCP and local workstations:
* **Live Streaming Execution Terminal**: Reads asynchronous deployment job files (`/tmp/gdc_deploy_*.json`) every 1,500ms, rendering ANSI-styled terminal output with auto-scrolling.
* **Pre-Flight Self-Healing**: Features automated pre-flight checks (such as pushing SSH public keys via `gcloud compute ssh` before Ansible execution) to prevent transient authentication errors.

### 4.3 `ConfigSyncManager.tsx` (1-Click GitOps Profile Orchestrator)
Simplifies Kubernetes ConfigSync management for retail edge environments:
* **Preset Workload Profiles**: Provides instant 1-click deployment buttons for standard retail topologies:
  * 🏪 **Standard Grocery POS Profile** (`/grocery-store-emulator`)
  * 🍃 **MongoDB TopoLVM Storage Bench** (`/mongo-performance-test`)
  * 🤖 **MFC Robotics & AI Vision** (`/mfc-robotics`)
  * 🔒 **PCI-DSS Compliance Bundle** (`/pci-dss-v4`)
* **Physical Node Reconciliation Map**: Visually maps active GitOps root syncs directly to underlying bare-metal host IP addresses (`node-1`, `node-2`, `node-3`).

### 4.4 `SentinelManager.tsx` (AI Watchdog Triage Engine)
An autonomous reliability agent that monitors edge cluster health:
* **Rule-Based Triage Matrix**: Classifies infrastructure failures (e.g. *Anthos bmctl Preflight Network MTU*, *GKE Registration Stale Membership*, *Docker Daemon OOM Crash*) and displays exact root causes and automated remediation commands.
* **Interactive Triage Loop**: Allows operators to execute continuous monitoring loops with adjustable polling intervals (15s to 300s) that automatically synchronize with top-bar project selectors.

---

## 5. Backend Communication Bridge (`/api/...`)

The frontend achieves direct hardware and cloud control by communicating with Next.js Serverless API routes in `ui/src/app/api/`:

1. **`/api/gcp/clusters` & `/api/gcp/projects`**: Executes `gcloud compute instances list` and `gcloud projects list` to dynamically discover available GDC edge deployments without hardcoded config files.
2. **`/api/infrastructure/provision` & `/api/infrastructure/logs`**: Spawns non-blocking Node.js child processes (`deployment-runner.ts`) running `terraform apply` and `ansible-playbook`, persisting progress in shared IPC state files.
3. **`/api/kubernetes/workloads` & `/api/kubernetes/exec`**: Interfaces with local `kubectl` contexts to fetch pod logs, execute interactive container bash commands, and inspect Multus secondary network annotations (`k8s.v1.cni.cncf.io/networks`).
4. **`/api/kubernetes/checkout` & `/api/kubernetes/configsync`**: Evaluates retail transaction formulas, computes DUKPT encryption latencies, and generates declarative `RootSync` Custom Resource Definitions (CRDs).

---

## 6. Summary

The GDC Edge Operations Portal frontend demonstrates how modern web development standards (**Next.js 16**, **React 19**, **Vanilla CSS Glassmorphism**, **Strict TypeScript**) can be combined with local infrastructure engineering tools to create an intuitive, highly responsive, and visually wowed control plane for distributed retail bare-metal environments.
