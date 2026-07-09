# 🛒 Kroger GDC Connected Hybrid PCI Edge Portal

The **Google Distributed Cloud (GDC) Connected Hybrid PCI Edge Portal** is an Infrastructure-as-Code (IaC) automation platform tailored specifically for Kroger's cloud engineering and store operations teams. It consolidates in-store payment and out-of-scope applications onto a high-performance bare-metal footprint using native layer-2/layer-3 VLAN network segmentation.

---

## 🚀 Two Ways to Deploy

### Option A: 1-Click Launch in Google Cloud Shell (No Install Required)
You can test and deploy Hybrid PCI clusters directly from your web browser using Google Cloud Shell—zero local installation required.

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/Ben-Chapman/Living-on-the-Edge.git&cloudshell_git_branch=main&cloudshell_tutorial=README-KROGER.md)

1. Click the **Open in Cloud Shell** button above.
2. Once Cloud Shell opens, start the portal dev server:
   ```bash
   cd experimental/gdc-on-gcp/ui-kroger
   npm install && npm run dev -- -p 3001
   ```
3. Click the **Web Preview** icon in Cloud Shell and select **Preview on port 3001**.

---

### Option B: Containerized Deployment via Docker Compose (Recommended for Engineers)
For cloud architects running on local laptops or dedicated workstations, use our self-contained Docker Compose bundle. It automatically mounts your existing Google Cloud SDK (`gcloud`) credentials and SSH keys.

#### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.
- Google Cloud CLI authenticated locally (`gcloud auth login` and `gcloud auth application-default login`).

#### 1-Command Startup
```bash
docker-compose -f docker-compose.kroger.yml up -d --build
```
Once built and started, open your web browser to:
👉 **http://localhost:3001**

---

## 🌐 Hybrid PCI Network Architecture & Presets

This portal natively supports the three-tier network architecture validated with Kroger's QSA (Coalfire), retiring restrictive kernel sandboxing (gVisor) in favor of high-performance `runc` containers mapped to dedicated Multus VLAN interfaces:

| Network Tier | Network Name | VLAN ID | Node CIDR | Pod CIDR | VIP / LB Pool | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **k8s Default** | `default` | `3030` | `192.168.120.12/30` | `10.0.2.0/23` | N/A | Primary GKE Control Plane & Platform Management. |
| **Non-PCI Secondary** | `non-pci-network-3130` | `3130` | `192.168.88.12/30` | `172.16.0.0/16` | `192.168.88.65/26` | Island-Mode Store Operations & Out-of-Scope Apps. |
| **PCI Secondary** | `pci-network-3430` | `3430` | `192.168.80.12/30` | `172.18.0.0/16` | `192.168.80.65/26` | Island-Mode CDE, NGPOS, and Fuel Payment Workloads. |

---

## 🛠️ Step-by-Step Provisioning Guide

1. **Open the Portal**: Navigate to `http://localhost:3001`.
2. **Set Project Scope**: In the top navigation bar, enter your target **GCP Project ID** (e.g., `kroger-store-1042`).
3. **Deploy New Cluster**: Click the **Deploy New Cluster** tab.
   - Enter your **GCP Billing Account ID** (if this is the first deployment in the project).
   - Enter your desired cluster name (e.g., `kroger-store-001`).
   - Choose your compute footprint (we recommend **`n2-standard-8`** for testing to optimize CPU quota).
   - Click **Deploy Virtual GDC Environment**.
4. **Configure VLANs**: Once provisioned, navigate to the **Network Manager** tab and click the 1-click preset launcher buttons for **VLAN 3030**, **VLAN 3130**, and **VLAN 3430** to attach the secondary Multus interfaces.
5. **Validate with Watchdog**: View real-time infrastructure telemetry, logs, and automated root-cause analysis (RCA) on the **Overview** dashboard.
