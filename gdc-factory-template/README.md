# 🌌 Google Distributed Cloud (GDC) Edge Studio & Customer Portal Generator

The **Google Distributed Cloud (GDC) Edge Studio & Customer Portal Generator** is an advanced white-label UI template, automation control plane, and multi-mode simulation platform. It empowers Solutions Architects (SEs), field engineers, and customer cloud teams to bootstrap, customize, and deploy tailored edge operations dashboards for any enterprise customer in minutes.

---

## 🌟 Executive Overview & Core Features

* **🎨 1-Click White-Label Theme Studio**: Live-customize customer identity, logo URLs, primary brand hex colors (with SE presets for major industry enterprises), and light/dark surface modes directly from the GUI without rebuilding containers or compiling code.
* **⚡ 3 Unified Operating Modes**: Seamlessly transition from offline laptop presentations on airplanes to active cloud deployments and live physical bare-metal hardware operations.
* **🧩 Dynamic Module Filtering by Industry Vertical**: Automatically tailor the portal navigation bar to display only the operational modules relevant to your customer’s industry (e.g., Retail POS, Manufacturing Robotics, Telecom Edge, or Storage Benchmarks).
* **🔍 Automated 1-Click Prerequisite Assessment**: Includes a native health checker (`check-prereqs.sh`) that evaluates workstation dependencies across all operating modes and provides instant copy-paste installation commands.
* **🛡️ Zero-Trust Security & IAP Tunneling**: Natively integrates with Google Cloud Identity-Aware Proxy (IAP), OS Login, and Application Default Credentials (ADC), ensuring zero public internet attack surfaces for in-scope compliance workloads.

---

## 🔄 The 3 Platform Operating Modes

This template is architected to support every phase of the customer adoption lifecycle:

| Operating Mode | Required Infrastructure | Best For | Technical Behavior |
| :--- | :--- | :--- | :--- |
| **🎭 Mode 1: Emulate-Only Mode** *(Offline Sandbox)* | **None** *(Just Node.js or Docker)* | Initial customer meetings, airplane demos, executive walkthroughs. | Bypasses local CLI execution (`gcloud`, `kubectl`, `terraform`) and serves high-fidelity synthetic telemetry streams (e.g., 24-lane checkout concurrency, MongoDB TopoLVM waterfall math, AI auto-healing animations). |
| **☁️ Mode 2: Argolis Cloud Sandbox** *(Virtual GDC Cluster)* | **Google Cloud Project** *(e.g., Argolis / Sandbox GCP)* | Hands-on SE proofs-of-concept (POCs), cloud validation testing, GitOps labs. | Uses the automated 5-step Terraform & Ansible provisioner (`ProvisionWizard.tsx`) to deploy virtual bare-metal compute nodes (`n2-standard-8`, `e2-standard-8`) and an Anthos cluster in ~25 minutes. |
| **🏢 Mode 3: Live Production Mode** *(Physical Edge Servers)* | **Physical Bare-Metal Nodes** *(Customer Data Center / Store)* | Long-running customer POCs, store operations control centers, production Edge SO. | Connects directly to physical host IP addresses, local NVMe logical volume groups (`TopoLVM RWO`), and live Kubernetes ConfigSync GitOps reconciliation pipelines. |

---

## 🎨 Using the White-Label Theme Studio

You can customize the portal for any customer in real time during a meeting or pre-configure it for a semi-permanent POC deployment.

### How to Launch the Studio:
1. Open the portal in your browser (`http://localhost:3000`).
2. In the top right navigation bar (next to the user profile badge), click **`🎨 Theme Studio`** (or press `Ctrl + Shift + T` if keyboard shortcuts are enabled).
3. In the studio modal, configure:
   * **🏢 Customer Identity**: Company name (e.g., *Target Retail Edge*, *Home Depot SO*, *Ford Edge Studio*) and logo URL.
   * **🎨 Brand Color Accent**: Pick a custom Hex color or select from SE quick presets (*Kroger Emerald*, *Home Depot Orange*, *Target Red*, *Walmart Blue*, *Google Cloud Blue*, *Caterpillar Gold*).
   * **Sliders for Operating Mode**: Switch instantly between *Emulate Mode*, *Argolis Sandbox*, or *Live Production*.
   * **👁️ Active Portal Modules**: Toggle individual navigation tabs on/off to customize views for store operators versus Kubernetes cloud architects.
4. Click **`✨ Apply White-Label Configuration`**! Your settings are immediately saved to `portal.config.json` and persisted across server restarts.

---

## 🛠️ 1-Click Prerequisite Assessment (`check-prereqs.sh`)

Before launching the portal or starting a cloud deployment, run the automated health check script from the repository root:

```bash
chmod +x check-prereqs.sh
./check-prereqs.sh
```

The script evaluates your workstation against the 3 operating tiers and reports exact dependency readiness:
* 🟢 **Tier 1 (Emulate Mode)**: Checks for `node` (v18+) and `npm` (marks Docker as an optional container alternative).
* 🟡 **Tier 2 (Argolis Mode)**: Checks for `gcloud`, `terraform` (v1.5+), `ansible-playbook` (v2.15+), `git`, and verifies active **GCP Application Default Credentials (ADC)**.
* 🔴 **Tier 3 (Production Mode)**: Checks for `kubectl` and confirms SSH ED25519/RSA keys are present in `~/.ssh/`.

If tools are missing, the script outputs the exact Homebrew (`macOS`) or `apt/dnf` (`Linux`) installation commands to get you ready in seconds.

---

## 🚀 Quick Start Guide

### Option A: Local Node.js Development Server
```bash
# 1. Check prerequisites
./check-prereqs.sh

# 2. Navigate to UI directory and install dependencies
cd gdc-factory-template/ui   # or root ui/
npm install

# 3. Start development server
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### Option B: Containerized Docker Launch (Zero Node.js Required)
```bash
docker build -t gdc-portal:latest -f ui/Dockerfile .
docker run -d -p 3000:3000 --name gdc-portal gdc-portal:latest
```
Open **`http://localhost:3000`** in your browser.

---

## 🏗️ Architecture & Component Reference

For a complete engineering deep-dive into the frontend technology stack (**Next.js 16**, **React 19**, **Vanilla CSS Glassmorphism**), component modules (`PerformanceDashboard.tsx`, `ProvisionWizard.tsx`, `ConfigSyncManager.tsx`), and Node.js child process command execution, reference **`FRONTEND_ARCHITECTURE.md`** in this repository.
