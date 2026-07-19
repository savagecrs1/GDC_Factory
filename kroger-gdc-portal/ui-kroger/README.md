# GDC Virtual Factory | Kroger Tech SO Portal

This is the React / Next.js web operations console for managing Google Distributed Cloud Software-Only (GDCSO) hybrid edge clusters for Kroger store environments.

---

## 🚀 Key Portal Features

1. **Fleet Hub & Cluster Status Manager**:
   * Auto-discovers active GCP projects via ADC authentication.
   * Displays live GKE Connect Fleet memberships, cluster node counts, and health status.
   * Highlights simulated/fallback cluster instances with high-contrast badges and clear emulated warnings.

2. **Operations Console (Navbar)**:
   * Real-time status indicator showing active background provisioning, teardowns, and jobs (`● 1 Running` vs `● Idle`).
   * Clicking the dropdown displays active job IDs, current steps, progress, and historical status with one-click navigation to live logs.

3. **Cluster Provisioner & Stepper**:
   * Interactive wizard for stamp-out bare-metal cluster deployment (GCP Setup ➔ Foundation ➔ Admin Workstation ➔ Node VMs ➔ Ansible ➔ bmctl install ➔ Retail App Pre-deploys).
   * **Secondary Networks (IPAM)**: Dynamic form for configuring store VLAN networks (VLAN Name, ID, Subnet, Gateway, VIP Range, Pod CIDR).

4. **Sentinel AI Sentinel Engine**:
   * Real-time triage of build failure modes (Org Policy blocks, billing status, credential expiration).
   * Provides **"Auto-Fix with Sentinel"** and **"Resume Build"** controls.

5. **GDC Interactive Web Console**:
   * Secure, web-based terminal into any node VM or KubeVirt container via IAP-tunneled `kubectl exec` shells.

---

## 🛡️ Upcoming Capabilities & Roadmap Features

### 1. 🌐 GDC Connectivity & Network Diagnostics Suite
Allows store network engineers to run a **"Test GDC Connectivity"** check before and after cluster provisioning:
* **Google Cloud APIs**: Tests `googleapis.com:443`, `accounts.google.com:443`, `oauth2.googleapis.com:443`.
* **GKE Connect & QBone Tunnel**: Validates `gkeconnect.googleapis.com:443` & `gkehub.googleapis.com:443` with ALPN `h2` HTTP/2 protocol negotiation to detect Deep Packet Inspection (DPI) proxy interference.
* **VLAN Tagging & Switch Infrastructure**: Probes secondary VLAN subinterfaces (e.g., `eth0.123`) with 802.1Q ARP/DHCP tests to detect switch ports incorrectly set to Access Mode instead of Trunk Mode.
* **NAT Egress & MTU Fragmentation**: Verifies Cloud NAT egress IP (`curl ifconfig.me`) and tests 1400-byte ICMP packet fragmentation to prevent QBone tunnel drops.
* **Inter-Node Subnet Ports**: Verifies internal VPC subnet ports (`6443` API, `10250` Kubelet, `7946` VXLAN/Serf).
* **Pinpointed Troubleshooting UI**: Displays exact failure location (DNS, Firewall, Switch Port, NAT, MTU) with specific fix instructions.

### 2. 🛡️ gVisor (`runsc`) Sandbox Simulation (`b/523229462`)
Simulates physical GDC container sandboxing using gVisor:
* **What It Is**: gVisor is a Go-based application kernel that intercepts container system calls, isolating untrusted store workloads from the host Linux kernel.
* **How It Works**: Registers `runsc` as an additional CRI runtime handler in `/etc/containerd/config.toml` alongside standard `runc`. Automatically configures `--platform=systrap` or `--platform=kvm` based on host virtualization capabilities per internal specification `b/523229462`.
* **Dynamic Workload Toggle**: Allows toggling `"Sandbox with gVisor"` ON/OFF per workload (adding `runtimeClassName: gvisor` to Pod specs). **Requires 0 cluster recreations**—workloads switch dynamically via standard rolling pod updates.

### 3. 💾 `ReadWriteMany` (RWX) Shared Storage Simulation
* **Robin.io vs. GDC Storage**: While typical Robin.io installations restrict volumes to `ReadWriteOnce` (RWO) block mode, GDC supports POSIX-compliant `ReadWriteMany` (RWX) shared file storage.
* **Feature Roadmap**: Adds a `shared-rwx` StorageClass allowing multiple POS checkout microservices across different nodes to concurrently read and write to the same persistent volume.
