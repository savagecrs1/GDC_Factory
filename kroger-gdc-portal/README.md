# 🛒 Kroger GDC Connected Hybrid PCI Edge Portal

The **Google Distributed Cloud (GDC) Connected Hybrid PCI Edge Portal** is an advanced Infrastructure-as-Code (IaC) automation platform tailored specifically for Kroger's cloud engineering and store operations teams. It enables effortless provisioning, validation, and management of 3-node bare-metal edge clusters on Google Cloud Platform (GCP) for cloud-based development and store simulation.

---

## 🌟 Core Capabilities Relevant to Kroger

* **🛡️ QSA-Validated Hybrid PCI Co-location**: Successfully consolidates in-scope PCI payment applications (NGPOS, Fuel Systems) and out-of-scope store operations workloads onto a single 3-node physical or virtual bare-metal footprint. Retires restrictive kernel sandboxing (gVisor) in favor of high-performance `runc` containers mapped to dedicated Multus VLAN interfaces.
* **⚡ Compact Cloud Test Footprints**: Natively supports optimized virtual compute footprints (such as **`n2-standard-8`** — 8 vCPUs, 32 GB RAM per node) with Intel Ice Lake nested virtualization. This allows engineering teams to rapidly spin up and tear down test clusters without exhausting regional GCP vCPU quotas.
* **🔄 Thread-Safe & Idempotent Automation**: Built on a resilient Terraform and Ansible execution engine that dynamically inspects real-time GCP cloud state. Multiple team members can test concurrently without IP collisions or state corruption.
* **🧠 AI-Powered Telemetry & Watchdog**: Features integrated real-time cluster health monitoring, live browser-based SSH/xterm terminal modals, automated ConfigSync GitOps management, and an AI Watchdog for instant Root Cause Analysis (RCA) of failing pods or network attachments.

---

---

## 🔐 Universal Access & Security Prereqs

This platform is 100% self-bootstrapping and portable to any Google Cloud organization. It requires no hardcoded environments, external IPs, or VPNs:
* **IAM Permissions**: Your Google Cloud user account needs **Owner** (or **Editor** + **Project IAM Admin**) on the target GCP Project to allow Terraform to enable APIs, create VPCs, and assign service accounts.
* **Zero External IPs (IAP Tunneling)**: In accordance with enterprise security standards, cluster nodes and admin workstations do not receive public external IPs. Our automation script dynamically enables **Identity-Aware Proxy (IAP)** and creates standard TCP forwarding rules (`allow-ssh-from-iap` from `35.235.240.0/20`), allowing secure SSH terminal tunneling from anywhere.

---

## 🚀 Ways to Deploy & Access the Portal

### Option A: 1-Click Launch in Google Cloud Shell (No Install Required)
You can test and deploy Hybrid PCI clusters directly from your web browser using Google Cloud Shell—zero local installation required.

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/savagecrs1/gdc-vm-configs.git&cloudshell_git_branch=main&cloudshell_tutorial=kroger-gdc-portal/README.md)

1. Click the **Open in Cloud Shell** button above.
2. Once Cloud Shell opens, start the portal dev server:
   ```bash
   cd gdc-vm-configs/kroger-gdc-portal/ui
   npm install && npm run dev -- -p 3001
   ```
3. Click the **Web Preview** icon in Google Cloud Shell and select **Preview on port 3001**.

---

### Option B: Containerized on Local Laptop (Docker Compose)
For cloud architects running on local laptops or dedicated workstations, use our self-contained Docker Compose bundle. It automatically mounts your existing Google Cloud SDK (`gcloud`) credentials and SSH keys.

#### 1-Command Startup
```bash
git clone https://github.com/savagecrs1/gdc-vm-configs.git
cd gdc-vm-configs/kroger-gdc-portal
docker-compose up -d --build
```
Once built and started, open your web browser to:
👉 **http://localhost:3001**

---

### Option C: Running on Remote Cloud Dev VMs (SSH Tunneling)
If you run the portal container or Node server on a remote headless cloud VM (such as Google Compute Engine or Cloud Workstations) instead of your local laptop, forward port 3001 over SSH:
```bash
# Run on your local laptop terminal to proxy port 3001 from the remote VM:
gcloud compute ssh <YOUR_CLOUD_VM_NAME> --project=<YOUR_DEV_PROJECT> --zone=<ZONE> -- -L 3001:localhost:3001
```
Once connected, open **http://localhost:3001** on your local laptop browser!

---

## 🌐 Hybrid PCI Network Architecture & VLAN Presets

This portal natively supports the three-tier network architecture validated with Kroger's QSA (Coalfire). The UI includes 1-click preset buttons that automatically configure the secondary Multus interfaces and layer-2/3 bridges across the nodes:

| Network Tier | Network Name | VLAN ID | Node CIDR | Pod CIDR | VIP / LB Pool | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **k8s Default** | `default` | `3030` | `192.168.120.12/30` | `10.0.2.0/23` | N/A | Primary GKE Control Plane & Platform Management. |
| **Non-PCI Secondary** | `non-pci-network-3130` | `3130` | `192.168.88.12/30` | `172.16.0.0/16` | `192.168.88.65/26` | Island-Mode Store Operations & Out-of-Scope Apps. |
| **PCI Secondary** | `pci-network-3430` | `3430` | `192.168.80.12/30` | `172.18.0.0/16` | `192.168.80.65/26` | Island-Mode CDE, NGPOS, and Fuel Payment Workloads. |

---

## 💾 Software-Defined Storage (SDS) & CSI Architecture

In bare-metal edge store deployments, stateful applications (such as POS databases and transaction queues) require reliable block storage across the 3 physical hosts.

### 1. Underlying Storage Slicing (TopoLVM)
During initial node provisioning, our automated Ansible engine attaches a secondary NVMe/SSD data disk (`google-data`) to each of the 3 cluster nodes and partitions it:
* **Partition 1 (`100GB`)**: Reserved for system host operations and container image cache.
* **Partition 2 (Remaining capacity)**: Formatted into a Local Logical Volume Manager (LVM) volume group named **`topolvm-vg`**. Our Helm automation deploys **TopoLVM** as the native local Container Storage Interface (CSI) driver.
* **ReadWriteOnce (RWO)**: Pods dynamically slice high-performance block persistent volume claims (PVCs) directly from the host's local disk with bare-metal disk I/O speeds.

### 2. Robin Cloud Native Storage (Robin CNS) Compatibility (Option A)
To ensure 100% compatibility with Kroger's existing Helm charts and manifests without introducing heavy SDS daemon overhead during development:
* We provide a lightweight **StorageClass Alias** (`robin` and `robin-cns`) that maps transparently to `topolvm.io`.
* Kroger developers can deploy charts requesting `storageClassName: robin` out-of-the-box on compact test VMs without modifying their production manifests.
* **ReadWriteMany (RWX) Extension**: When shared file storage across multiple nodes is required, a lightweight NFS external provisioner can be deployed on top of the RWO block storage pool to serve shared volumes across the internal VLAN pod network.

---

## 🛠️ Step-by-Step Provisioning Guide

1. **Open the Portal**: Navigate to `http://localhost:3001`.
2. **Set Project Scope**: In the top navigation bar, enter your target **GCP Project ID** (e.g., `kroger-store-1042`).
3. **Deploy New Cluster**: Click the **Deploy New Cluster** tab.
   - Enter your **GCP Billing Account ID** (if this is the first deployment in the project).
   - Enter your desired cluster name (e.g., `kroger-store-001`).
   - Choose your compute footprint (**`n2-standard-8`** recommended for cloud simulation).
   - Click **Deploy Virtual GDC Environment**.
4. **Configure VLANs**: Once provisioned, navigate to the **Network Manager** tab and click the 1-click preset launcher buttons for **VLAN 3030**, **VLAN 3130**, and **VLAN 3430** to attach the secondary Multus interfaces.
5. **Validate & Monitor**: View real-time cluster health, logs, and automated root-cause analysis on the **Overview** dashboard.
