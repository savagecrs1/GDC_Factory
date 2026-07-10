# 🖥️ GDC Edge Virtual Machine (VM) Images & Templates

This directory houses all virtual machine definitions, ISO manifests, and OS templates for deploying virtual machines onto Google Distributed Cloud (GDC) bare-metal edge nodes using the KubeVirt runtime (`gdc-vm-runtime`).

## 📁 Directory Structure
* **`Rocky/`**: Rocky Linux 9 edge server templates.
* **`windows10/`**, **`windows11/`**, **`windows7/`**, **`windowsxp/`**: Microsoft Windows OS workstation and legacy retail point-of-sale VM manifests.
* **`solaris10/`**, **`haiku/`**, **`kdeneon/`**: Unix and lightweight edge desktop simulation images.
* **`active-workloads/`**: Running persistent VM instance templates and storage disk manifests.
* **`vm-template.yaml`**: Standard KubeVirt `VirtualMachine` manifest template with 2 vCPUs, 4GB RAM, and VirtIO disk controllers.
* **`virtio-iso.yaml` & `windows-remote-installation.yaml`**: Unattended OS installation manifests and VirtIO driver disk attachments for Windows setups.

---

## 💡 Storage & Ingestion Architecture: Minimizing Laptop & Cloud Storage Costs

To deploy these virtual machines efficiently without consuming 20GB+ of local laptop hard drive space or incurring ongoing Google Cloud Storage (GCS) bucket storage billing, GDC leverages two zero-storage ingestion mechanisms:

### 🥇 1. OCI ContainerDisks (Recommended - Zero Laptop Storage & Cents in Cloud)
Instead of downloading massive `.qcow2` or `.iso` disk files to your workstation, KubeVirt packages virtual disks inside standard OCI container images stored in container registries (e.g., GitHub Container Registry GHCR, Quay.io, or Google Artifact Registry):
* **How it works**: The `.qcow2` virtual disk file is copied into the `/disk/` directory of a scratch container image (`FROM scratch`, `COPY windows11.qcow2 /disk/`).
* **Zero Local Storage**: You never store or download the disk image on your laptop.
* **High-Speed Caching**: When you click **Deploy Virtual Machine** in the portal, Kubernetes uses `containerd` on the bare-metal edge nodes (`node-1`, `node-2`) to pull the container layer directly onto the node's local NVMe drive. Subsequent VM spin-ups use the cached layer instantly!

### 🥈 2. Ephemeral HTTP/S Streamed URLs (Zero Cloud Bucket Hosting)
For public Linux distributions (Ubuntu, Debian, RHEL, Rocky), KubeVirt's Containerized Data Importer (CDI) streams disk images directly from official upstream mirror URLs into local TopoLVM PersistentVolumeClaims (`PVCs`):
* **How it works**: Select **`🌐 HTTP/S Disk URL`** in the portal deployer and paste the upstream cloud image URL (e.g., `https://cloud-images.ubuntu.com/.../disk-kvm.img`).
* **Zero Cost**: Bypasses cloud bucket hosting entirely by streaming directly from OS vendor CDN networks into edge storage.

---

## 🚀 Usage in GDC Portal
In the **`GDC VM Runtime`** tab of the portal GUI, SEs and administrators can click **Deploy Virtual Machine** to instantly select any image from this folder and provision it across bare-metal nodes using ContainerDisks or HTTP streams.
