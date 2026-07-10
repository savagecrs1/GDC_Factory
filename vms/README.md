# 🖥️ GDC Edge Virtual Machine (VM) Images & Templates

This directory houses all virtual machine definitions, ISO manifests, and OS templates for deploying virtual machines onto Google Distributed Cloud (GDC) bare-metal edge nodes using the KubeVirt runtime (`gdc-vm-runtime`).

## 📁 Directory Structure
* **`Rocky/`**: Rocky Linux 9 edge server templates.
* **`windows10/`**, **`windows11/`**, **`windows7/`**, **`windowsxp/`**: Microsoft Windows OS workstation and legacy retail point-of-sale VM manifests.
* **`solaris10/`**, **`haiku/`**, **`kdeneon/`**: Unix and lightweight edge desktop simulation images.
* **`active-workloads/`**: Running persistent VM instance templates and storage disk manifests.
* **`vm-template.yaml`**: Standard KubeVirt `VirtualMachine` manifest template with 2 vCPUs, 4GB RAM, and VirtIO disk controllers.
* **`virtio-iso.yaml` & `windows-remote-installation.yaml`**: Unattended OS installation manifests and VirtIO driver disk attachments for Windows setups.

## 🚀 Usage in GDC Portal
In the **`GDC VM Runtime`** tab of the portal GUI, SEs and administrators can click **Deploy VM from Template** to instantly select any image from this folder and provision it across bare-metal nodes.
