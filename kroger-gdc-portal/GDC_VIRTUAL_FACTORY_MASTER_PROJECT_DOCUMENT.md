# 🌐 Google Distributed Cloud (Software-Only) Virtual Factory
## Master Project History, System Architecture, Feature Log, & Roadmap Reference
* **Document Status**: Complete Consolidated Master Reference  
* **Date**: July 2026  
* **Scope**: Infrastructure Automation, Next.js Portals (`ui-kroger` & `ui`), Sentinel AI Engine, Fleet Audit & Garbage Collection, Security & Diagnostics  

---

## 📑 Table of Contents
1. [Executive Overview & Vision](#1-executive-overview--vision)
2. [Two-Tier System Architecture](#2-two-tier-system-architecture)
3. [Comprehensive Portal Feature Log](#3-comprehensive-portal-feature-log)
4. [Complete Development Session History](#4-complete-development-session-history)
5. [Resolved Bug & Technical Debugging Log](#5-resolved-bug--technical-debugging-log)
6. [Multi-Project Fleet Cleanup & Audit Report](#6-multi-project-fleet-cleanup--audit-report)
7. [Automated GDC Garbage Collector Service](#7-automated-gdc-garbage-collector-service)
8. [Upcoming Feature Specifications & Roadmap](#8-upcoming-feature-specifications--roadmap)
9. [Host Prerequisites & Deployment Guide](#9-host-prerequisites--deployment-guide)

---

## 1. Executive Overview & Vision

The **Google Distributed Cloud (GDCSO) Virtual Factory** is an enterprise-grade automation and web portal suite designed to simulate, provision, and manage Google Distributed Cloud Software-Only (GDCSO) hybrid edge clusters on Google Compute Engine (GCE) infrastructure. 

By replacing expensive physical hardware testbeds with rapid, on-demand virtual bare-metal footprints, the Virtual Factory enables engineering and product teams to test retail store workloads (such as POS checkout microservices, KubeVirt virtual machines, and secondary VLAN networks) in minutes—without hardware lock-in or cost leakage.

---

## 2. Two-Tier System Architecture

The project utilizes an enterprise **Two-Tier (Foundation / Cluster) Architecture** to ensure scaling to hundreds of ephemeral clusters without destroying shared management infrastructure:

```mermaid
graph TD
    subgraph Shared Foundation Layer
        VPC[Core VPC Network & Subnets]
        NAT[Cloud NAT Router]
        SA[Provisioning Service Accounts]
        WS[Admin Workstation: gem-admin-ws]
    end

    subgraph Ephemeral Cluster Footprints
        C1[Cluster 1: node1, node2, node3]
        C2[Cluster 2: node1, node2, node3]
        CN[Cluster N: node1, node2, node3]
    end

    subgraph Ingress Layer
        ER[Edge Router VM: e2-small / VXLAN Fabric]
    end

    Shared Foundation Layer --> Ephemeral Cluster Footprints
    Ingress Layer --> Ephemeral Cluster Footprints
```

1. **The Foundation (`terraform/bootstrap`)**: Provisions permanent, shared infrastructure: core VPC network, Cloud NAT, Service Accounts, and a dedicated, decoupled Admin Workstation (`gem-admin-ws`) used to safely orchestrate Anthos installations.
2. **Ephemeral Clusters (`terraform/`)**: Used as a template to rapidly stamp out 3-node GDCSO cluster footprints (`node1`, `node2`, `node3`). Uses data sources to automatically attach new nodes to the shared foundation.
3. **The Edge Router (`terraform/edge-router`)**: Provides an optional dedicated ingress VM (`e2-small`) that participates in emulated secondary networks (VXLANs). Routes traffic from local workstations directly into isolated cluster VLANs (like MetalLB VIPs) using tools like Traefik or SOCKS5 proxies.

---

## 3. Comprehensive Portal Feature Log

### 3.1 ⚡ GDC Interactive Web Console
* **Web-Based Terminal**: Shell terminal access directly into virtual machine container nodes on the baremetal cluster.
* **IAP Tunneling**: Tunnels through GCP Identity-Aware Proxy (IAP) using `kubectl exec` shells targeted via Connect Gateway contexts.
* **Console UI**: Interactive xterm-based `WebTerminalModal` modal connecting to nodes/VMs.

### 3.2 📁 Automatic Namespace Management
* **Dynamic Auto-Creation**: Auto-creates target namespaces when applying VM deployments. Queries `/api/v1/namespaces/NAMESPACE` and calls `createNamespace` if missing before writing KubeVirt manifests.

### 3.3 🛡️ GKE Connect Gateway Context Auto-Switching
* **Dynamic Kubeconfig Parser**: Reads available GKE Connect contexts from `~/.kube/config` and calls `kc.setCurrentContext` to dynamically align with selected `projectId` and `clusterName`.

### 3.4 📈 Resumable Stepper & AI Sentinel Auto-Repair Panel
* **Progressive Stepper**: Visual stepper tracking GCP Setup ➔ Foundation VPC ➔ Admin WS ➔ Node VMs ➔ Ansible setup ➔ bmctl install ➔ Presets pre-deploy.
* **Sentinel Auto-Repair**: Detects provisioning failure modes (Org Policy restrictions, disabled billing, unlinked accounts) and offers an **"Auto-Fix with Sentinel"** remediation button.
* **Resumable Builds**: Resumes provisioning from the exact failed step instead of starting over.

### 3.5 📊 Operations Console & Real-Time Navbar Status
* **Global Navbar Indicator**: Pulsing status badge (`● 1 Running` vs `● Idle`).
* **One-Click Navigation**: Dropdown menu displaying active job IDs, current steps, progress, and historical status with direct link to live log streaming.
* **Container-Isolated Scroll**: Terminal scrolling is isolated to the inner console window (`scrollTop = scrollHeight`), leaving the main page viewport stationary.

### 3.6 🌐 Kroger Secondary Networks (IPAM)
* **Store VLAN Configuration**: Dynamic form allowing Kroger admins to configure secondary networks with custom VLAN Name, VLAN ID, Subnet CIDR, Gateway, VIP Range (MetalLB), and Pod CIDR.

### 3.7 🏷️ Fleet Hub Status Enhancements
* **High-Contrast Badges**: Upgraded status pills with light-theme optimized contrast (`bg-sky-100 text-sky-800` for active clusters).
* **Emulated Mode Highlighting**: When live GKE Hub query falls back to mock data (`source === 'fallback'`), renders a **Simulated** pill and an explicit warning banner: `Cluster is emulated. No active physical instances provisioned in this project.`

---

## 4. Complete Development Session History

1. **Localhost & Portal Verification**: Validated local dev servers running on port 3001 (`ui-kroger`) and port 3002 (`ui`).
2. **Resource Leakage & Cluster Cleanup Audit**: Identified stale GCE VM node groups and legacy GKE Connect memberships across 15 sandbox projects outside of `kroger-test-4`.
3. **Dynamic Zone Resolver Implementation**: Replaced hardcoded `--zone us-central1-a` variables in `deployment-runner.ts` with dynamic `getInstanceZone` helper querying actual node locations via `gcloud`.
4. **Operations Console Navbar Integration**: Built `OperationsIndicator` UI component, `GET /api/infrastructure/operations` API, and state handlers.
5. **GDC Garbage Collector Deployment**: Created and launched background sidecar service (`scripts/gdc-garbage-collector.js`) running sweeps every 2 hours.
6. **Container Scroll Fix**: Replaced `scrollIntoView()` with container-level `scrollTop` manipulation to prevent viewport jumping.
7. **Clean E2E Verification Run**: Executed single end-to-end verification test run on project `kroger-test-2` (`autotest-1-lffv`).
8. **Roadmap & Executive Documentation**: Published executive summary, project documentation updates, and master project document.

---

## 5. Resolved Bug & Technical Debugging Log

| Bug / Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| `namespaces "gdc-vms" not found` (404) | VM manager assumed target namespace already existed on the cluster. | Added core API `createNamespace` check-and-create step in POST handler. |
| `kubectl: gke-gcloud-auth-plugin not found` | Host machine missing Google Cloud SDK GKE auth component. | Installed component on host and added verification in setup script. |
| VM commands target stale clusters | Stale context selected in `~/.kube/config` when switching projects. | Dynamic context switching implemented in `lib/k8s-client.ts`. |
| Provisioning step matching offsets | Stepper hardcoded index parsing failed with alphabetical indices (`2a`, `2b`). | Swapped exact index logic with robust step-prefix string matching. |
| KubeVirt VM pods not found in console | Exec selector filtered by `kubevirt.io/domain` label missing in this release. | Updated selector in `exec/route.ts` to standard `vm.kubevirt.io/name`. |
| VM stuck in `ErrorUnschedulable` | Node VMs had KVM disabled locally and memory default set to `8Gi`. | Patched KubeVirt to run in software emulation mode, reduced default RAM to `2Gi`. |
| Console line clipped | Terminal outer padding clipped xterm view, missing bottom scroll snapping. | Removed outer container padding, set custom bottom margin, added `scrollToBottom()`. |
| Workload zone mismatch | Hardcoded `--zone us-central1-a` in gcloud SSH caused connection failures in other regions. | Resolved hardcoded zone with dynamic `getInstanceZone` helper querying GCE node zone. |
| Main page jumps on log stream | Document-level `scrollIntoView()` forced entire browser window downward. | Replaced document scroll with container-isolated `scrollTop = scrollHeight`. |
| Hardcoded User Paths (`/Users/chrissavage`) | Fixed local home paths breaks execution on other machines/users. | Replaced all hardcoded paths with dynamic `process.env.HOME` / `$HOME` resolution. |
| Hardcoded Personal Emails & Billing IDs | Hardcoded admin emails and billing account IDs broke customer portability. | Replaced with dynamic `gcloud config get-value account` resolution and form controls. |
| `/b/b/b/b` Requeue Log Spam | `bmctl` ANSI backspaces & requeue loops flooded terminal logs with 50+ lines. | Added regex ANSI/backspace sanitizer and in-place log timestamp deduplication in `appendLog`. |

---

## 6. Multi-Project Fleet Cleanup & Audit Report

### 6.1 Audit Scan Summary
A full organization scan of 16 sandbox projects (excluding `kroger-test-4`) identified stale GCE node VMs and registered GKE Connect memberships left over from canceled or crashed test runs.

### 6.2 Decommissioned Resources
The automated cleanup script (`scratch/cleanup-all-clusters.js`) successfully purged resources across 15 projects:
* **VM Node Groups Deleted**: `kroger-test-2` (`kroger-store-002a-node-1/2/3`), `gemini-test-work-496319` (`autotest-2-yq3j-node-1/2/3`), `vdc-18818` (`vdc-18818-cluster-1-node-1/2/3`, `gem-admin-ws`), `gpctest-394014` (`autotest-3-r615-node-1/2/3`), `core-edge-rhel` (`autotest-4-8jdn-node-1/2/3`), `core-edge-dm1` (`autotest-1-ukye-node-1/2/3`).
* **Fleet Memberships Unregistered**: `kroger-store-002`, `kroger-test-store-001`, `autotest-2-yq3j`, `vdc-18818-cluster-1`, `autotest-3-r615`, `autotest-4-8jdn`, `autotest-1-afft`, `autotest-3-hki9`, `autotest-5-ghtr`, `cnuc-1`, `autotest-1-ukye`, `kr100-cluster`.
* **Current Status**: **100% of stale virtual GDC cluster resources outside of `kroger-test-4` have been destroyed and unregistered.**

---

## 7. Automated GDC Garbage Collector Service

To permanently prevent cost leaks from canceled or interrupted test runs, we implemented an automated background garbage collector service:

* **File**: `scripts/gdc-garbage-collector.js` (Running as background task `task-3816`).
* **Schedule**: Sweeps all GCP projects in the organization every 2 hours.
* **Purge Criteria**: Identifies GCE VM instances or fleet memberships starting with `autotest-`, `kroger-store-`, `abm-`, or `cnuc-` that have been alive for more than **2 hours**.
* **Safety Rules**: Excludes `kroger-test-4` and non-GDC instances. Automatically disables GCE deletion protection before terminating instances.

---

### 3.12 🌐 GDC Connectivity & Network Diagnostics Suite
* **API Endpoint**: `POST /api/gcp/network/diagnose` executing 5 automated probes:
  1. Google Cloud Core APIs (`googleapis.com:443`).
  2. GKE Connect & QBone ALPN HTTP/2 protocol negotiation.
  3. Secondary Network 802.1Q VLAN subinterfaces (`eth0.123`) for switch Trunk vs Access mode.
  4. Cloud NAT egress & 1400-byte ICMP MTU packet fragmentation.
  5. Inter-Node VPC subnet internal ports (`6443`, `10250`, `7946`).
* **Interactive UI Modal**: Accessible via **"Test GDC Connectivity"** buttons on **Fleet Hub** and **VLAN Network Manager**. Renders a 5-layer diagnostic hop diagram with pinpointed root cause and remediation steps.

### 3.13 🛡️ gVisor (`runsc`) Container Security Sandbox (`b/523229462`)
* **Ansible Installation**: Added automated task in `ansible/roles/cluster_nodes/tasks/main.yaml` installing `runsc` and `containerd-shim-runsc-v1` with `--platform=systrap` per internal spec `b/523229462`.
* **Dynamic Workload Toggle**: Added **"🛡️ Enable gVisor (`runsc`) Container Security Sandbox"** checkbox in the **Deploy Workload** modal (`WorkloadManager.tsx`). Allows running workloads inside gVisor sandbox with **0 cluster restarts required**.

### 3.14 ⏱️ Stepper ETA & Elapsed Timer UI
* **Progress Header**: Displays `⏱️ Orchestration Progress Est. ~12m total` and step completion counter in `ProvisionWizard.tsx`.
* **3px Progress Bar**: Top gradient progress bar (`from-sky-500 via-indigo-500 to-purple-600`) advancing per completed step.
* **Duration Badges**: Appends expected step durations (`~15s`, `~45s`, `~3m`, `~2m`, `~5-7m`, `~1m`) to all step badges.

### 3.15 🎨 High-Contrast GCP Auth Warning Banner
* **Enhanced Readability**: Updated `Navbar.tsx` unauthenticated warning banner to dark amber `bg-amber-950/90` with sharp white bold text (`text-white font-bold`) and high-contrast code badge (`gcloud auth login && gcloud auth application-default login`).

---

## 4. Complete Development Session History

### 4.1. Transient E2E Failure Root Cause & Resolution
* **Issue**: E2E test run failed during Step 5 on task `Render Network Custom Resources` with `fork: Resource temporarily unavailable`.
* **Root Cause**: macOS hit process fork limits (`ulimit -u`) due to rapid SSH subprocess forks during Ansible execution on `gem_admin_ws`.
* **Fix**: Updated `ansible/ansible.cfg` with `forks = 5`, `retries = 5`, and SSH KeepAlive settings.
* **Host Process Recovery**: Provided immediate 1-liner `pkill -9 -f ssh; pkill -9 -f ansible` to release lingering SSH multiplex sockets.

---

## 8. Feature Roadmap & Next Steps

### 8.1 💾 `ReadWriteMany` (RWX) Shared Storage Simulation
* **Robin.io vs. GDC Storage**: Adds POSIX-compliant `ReadWriteMany` (RWX) shared file storage class (`shared-rwx`) allowing POS checkout microservices across different nodes to concurrently read and write to the same persistent volume.

---

## 9. Host Prerequisites & Deployment Guide

Ensure these tools are configured on the deployment host:
* [x] **Google Cloud SDK (`gcloud`)**
* [x] **gke-gcloud-auth-plugin** (`gcloud components install gke-gcloud-auth-plugin`)
* [x] **HashiCorp Terraform CLI**
* [x] **Ansible & ansible-playbook**

### Running the Web Portals Locally
```bash
# Kroger Tech SO Portal (Port 3001)
cd ui-kroger && npm run dev -- -p 3001

# Standard GDCSO Portal (Port 3002)
cd ui && npm run dev -- -p 3002
```

### Running the Automated Garbage Collector
```bash
node scripts/gdc-garbage-collector.js
```
