# 📜 GDC Factory: Comprehensive Project History, Architecture & Efficiency Roadmap

This document serves as the central log and engineering roadmap for the **Google Distributed Cloud (GDC) Factory** project. It details our transformation from a single custom portal into a dual-portal, multi-tenant Edge Studio platform, records major technical accomplishments, and outlines strategic ideas for maximizing automation efficiency and minimizing infrastructure overhead.

---

## 🌌 1. Executive Vision & Architectural Split

To prevent vendor leakage and enable effortless pre-sales demos for new customers while preserving deep enterprise customizations for existing accounts, the repository was standardized into **two standalone, self-bootstrapping portals** under the `GDC_Factory` root:

* **`gdc-factory-template/`** (Port `3000`): The vendor-neutral **GDC Edge Studio & Customer Portal Generator**. Designed for field Solutions Architects (SEs) and cloud architects to customize and bootstrap edge control planes for any enterprise in minutes. Contains zero vendor-specific branding.
* **`kroger-gdc-portal/`** (Port `3001`): Strictly tagged for **Kroger Edge Operations**. Houses enterprise-specific retail workloads, QSA Hybrid PCI Co-location validation, and chained database storage benchmarks.
* **`gdc-ux-sandbox/`** (Port `3002`): Dedicated **UX & Navigation Staging Sandbox** locked in 100% Offline Simulation Mode. Allows safe prototyping of UI layouts, navigation hierarchy, theme modifications, and interactive cards without risking disruption to live bare-metal clusters or active cloud provisioning pipelines!

---

## 🏆 2. Major Technical Accomplishments & Features Built

### 🎨 A. White-Label Theme Studio & Runtime Engine
* **Interactive Customization (`ThemeStudioModal.tsx`)**: Created a live GUI studio modal (accessible via navbar button or `Ctrl + Shift + T`) allowing instant customization of customer identity, logo URLs, brand Hex colors (with SE presets for Target, Home Depot, Walmart, Caterpillar, Google Cloud), and light/dark surface modes.
* **Persistent Runtime API (`/api/portal/config`)**: Configured dynamic CSS custom property runtime injection (`ConfigProvider.tsx`) that reads and writes branding to `portal.config.json` without rebuilding Docker containers or compiling code.
* **Dynamic Tab Module Filtering**: Added the ability to toggle individual navigation bar tabs on/off by industry vertical (e.g., hiding K8s internals for store operators while showing them for cloud engineers).

### ⚡ B. The 3 Unified Operating Modes
Implemented seamless runtime switching across three distinct infrastructure tiers:
1. `🎭 Emulate-Only Mode (Offline Sandbox)`: Bypasses local shell CLI execution (`gcloud`, `kubectl`, `terraform`) and serves high-fidelity synthetic telemetry streams (24-lane checkout concurrency, TopoLVM I/O waterfalls, AI auto-healing animations). Ideal for airplane demos and initial executive presentations.
2. `☁️ Argolis Cloud Sandbox Mode`: Uses the automated 5-step Terraform & Ansible provisioner (`ProvisionWizard.tsx`) to deploy virtual bare-metal compute nodes (`n2-standard-8`) and an Anthos cluster in GCP in ~25 minutes.
3. `🏢 Live Production Bare-Metal Mode`: Interfaces directly with physical customer edge servers, local NVMe drives, and live ConfigSync GitOps reconciliation pipelines.

### 🛡️ C. Active Workflow Protection & Safety Guards
* **2-Step "Force Stop" Guard with Teammate Alerts**: Protected the `cancelDeployment` button with an inline confirmation modal that warns when an active deployment is executing on a target project, preventing accidental interruption of teammate workflows.
* **2-Step "Destroy Cluster" Guard**: Added secondary confirmation banners before initiating `terraform destroy`.
* **Scoped Deletion Protection Removal (`project-setup.sh`)**: Added an automated pre-flight loop that strips GCP instance deletion protection *strictly* from managed deployment targets (`gem-admin-ws`, `gem-edge-router`, `${CLUSTER_NAME}-node-*`), leaving unrelated database or teammate dev VMs in shared projects 100% safeguarded.
* **Explicit Terraform Unlocking**: Set `deletion_protection = false` universally across all compute node definitions.
* **Prominent "🔄 Retry Provisioning Step" Button**: Added instant resume capabilities inside the Cluster Provisioner when deployments pause or encounter errors.

### 🛒 D. Multi-Lane Grocery POS Checkout Simulator
* **24-Lane Concurrency Streaming**: Built an interactive scaling grid in `PerformanceDashboard.tsx` simulating Front End attended registers and Self-Checkout (SCO) bays.
* **Event-Driven Cashier Telemetry**: Recreated realistic item-by-item UPC barcode scanning (`~450ms` delays), loyalty card promotional discount reconciliation, point-to-point DUKPT encryption handshakes over isolated VLANs, and electronic receipt assembly.

### 🍃 E. Kroger isc-utility MongoDB TopoLVM Storage Benchmark
* **5-Tier Chained Microservice Architecture**: Integrated Kroger's pure Go 1.22 dependency-free testing suite (`entry` -> `cache` -> `cpu` -> `memory` -> `database`) across TopoLVM RWO storage volumes.
* **4-Stage Waterfall Telemetry**: Built automated latency attribution breakdown charts (Network Overlays, CPU Crypto, DB Lookups, Storage IOPs) with real-time AI engineering bottleneck diagnostics.

### 🖥️ F. Zero-Cost OCI ContainerDisk & HTTP Streaming VM Catalog
* **Top-Level `vms/` Repository**: Consolidated all VM OS definitions (Windows 11/10/7/XP, Solaris 10, Haiku, KDE Neon, Rocky Linux 9) into a centralized catalog.
* **Zero Laptop Storage & Cents in Cloud**: Architected KubeVirt definitions to use OCI **ContainerDisks** (`docker.io/gdc-factory/...`) and ephemeral HTTP/S upstream CDN urls (`dataVolume`). This eliminates downloading 20GB+ `.qcow2` files to MacBooks or paying for persistent Google Cloud Storage (GCS) buckets.

### ☸️ G. Out-of-the-Box GitOps Verification Workloads (`k8s/`)
* Created `k8s/root-sync/root-sync-demo.yaml` and `k8s/workloads/demo-workloads.yaml` (3-replica NGINX web server on NodePort `30080` + Redis cache).
* Wired up 1-click **`☸️ Standard K8s Demo Workloads`** preset launcher buttons in the GUI to verify continuous GitOps reconciliation in seconds.

### 🔍 H. 1-Click Prerequisite Checker (`check-prereqs.sh`)
* Created an automated bash script in the repository root that evaluates workstation readiness across Emulate, Argolis, and Production tiers, checks GCP Application Default Credentials (ADC) status, and outputs copy-paste `brew` and `apt/dnf` installation commands.

### ☁️ I. Immutable Google Cloud Branding
* Embedded a fixed-position, high-resolution 4-color Google Cloud SVG badge (`Powered by Google Distributed Cloud`) at the root layout level (`layout.tsx`) across all portals, immutable except by declaration.

---

## 💡 3. Future Roadmap & Efficiency Optimization Ideas

To continue making GDC Factory as lightweight, fast, and scalable as possible, the following engineering initiatives are recommended for future sprints:

| Initiative | Target Area | Description & Efficiency Gain |
| :--- | :--- | :--- |
| **1. WebSocket / gRPC Streaming Upgrade** | **Telemetry & Terminals** | Upgrade from Server-Sent Events (`EventSource`) to bi-directional WebSockets or gRPC-web. This will reduce TCP overhead, enable sub-10ms terminal latency in `InteractiveXterm.tsx`, and allow bidirectional cashier scanner inputs during POS emulation. |
| **2. Automated ContainerDisk CI/CD Pipeline** | **VM Storage Engine** | Implement a GitHub Actions workflow (`.github/workflows/vms.yml`) that automatically builds and pushes OCI scratch container images (`docker.io/gdc-factory/vms-*`) whenever `.qcow2` or driver files are modified in `vms/`. |
| **3. Multi-Cluster Aggregated Control Plane** | **Multi-Tenant UI** | Expand `Dashboard.tsx` with a multi-cluster switcher, allowing a single portal instance to monitor and manage dozens of GDC edge clusters across different physical store locations simultaneously. |
| **4. AI Watchdog Autonomous Self-Healing** | **Sentinel Engine** | Extend `sentinel-engine.ts` from passive triage reporting to active self-healing webhooks. Allow the watchdog to automatically execute `kubectl scale` or restart Multus CNI attachments when network MTU drops are detected. |
| **5. Lightweight SQLite/DuckDB Metric Cache** | **Performance Storage** | Integrate an embedded DuckDB or SQLite web-assembly cache inside the Next.js runtime to store historical benchmark runs locally without requiring an external database server. |
| **6. Terraform State Lock Self-Healing** | **Provisioner Engine** | Add automated detection for orphaned GCS backend state locks (`terraform force-unlock`) inside `project-setup.sh` when a previous deployment process is abruptly terminated by an OS reboot. |
