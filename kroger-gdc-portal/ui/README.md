# Google Distributed Cloud (Software-Only) Web Portal

This is the standard React / Next.js web portal for managing Google Distributed Cloud Software-Only (GDCSO) hybrid environments.

---

## 🚀 Key Portal Features

1. **Fleet Hub**: Multi-project cluster discovery, GKE Connect Fleet status monitoring, and simulated environment detection.
2. **Operations Console**: Top navigation bar indicator tracking active provisioning and teardown jobs with live log streaming.
3. **Cluster Provisioner**: Step-by-step Anthos Bare Metal cluster orchestration.
4. **Sentinel AI Engine**: Automated diagnostic triage and self-healing.
5. **GDC Web Console**: Web-based IAP-tunneled shell into node VMs and KubeVirt containers.

---

## 🛡️ Upcoming Capabilities & Roadmap Features

### 1. 🌐 GDC Connectivity & Network Diagnostics Suite
Allows engineers to test GDC network communications via a **"Test GDC Connectivity"** button:
* Probes `googleapis.com:443` and `gkeconnect.googleapis.com:443` (HTTP/2 ALPN gRPC check).
* Pinpoints VLAN 802.1Q switch trunking errors, Cloud NAT egress issues, MTU fragmentation, and inter-node firewall port blocks.

### 2. 🛡️ gVisor (`runsc`) Sandbox Simulation (`b/523229462`)
Simulates physical GDC container sandboxing using gVisor (`runsc` runtime with `--platform=systrap` configuration). Per-workload toggle without cluster recreation.

### 3. 💾 `ReadWriteMany` (RWX) Shared Storage Simulation
Support for multi-pod concurrent read/write shared volumes (`shared-rwx` StorageClass).
