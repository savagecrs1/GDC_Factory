# 🚀 Cluster Migration & Recovery Guide

This guide provides step-by-step instructions for updating SoT, cleaning up workloads, migrating clusters, and restoring services.

---

## 📌 Prerequisites

- Access to the SoT repository  
- Permission to push and merge changes  
- Kubernetes CLI (`kubectl`) configured  
- Bash environment  

---

## 🧭 Step 1: Update Source of Truth (SoT)

### 🔧 Changes to Make

- Set **config sync period** to `8h`
- Update **ClusterDNS** to `8.8.8.8`
- set isc-apps-replicas to `0`
- Rename hostnames:
  - `ciXXXh` → `ciXXX`
  - Example: `ci009h` → `ci009`

### ✅ Finalize

- Commit and push changes  
- Merge into the correct branch  
  - Example: `ci009` → `dev` branch  

---

## 📥 Step 2: Clone Utility Repository

Clone the repository to access cleanup and recovery scripts:

```bash
git clone https://github.com/krogertechnology/isc-utility-project.git
cd isc-utility-project
````

📁 Scripts are available under the `hybrid_cluster_migration/` directory.
```bash
cd hybrid_cluster_migration
ll
```

***

## 🧹 Step 3: Cleanup Workloads & Networks

Run the following scripts to scale down workloads and delete networks.

### 🔻 Non-PCI Network `~25m`

```bash
python k8s_cleanup.py --network non-pci-network-3130=mongodb,elastic-system,rabbitmq-system,ngpos-apex,ngpos-dev,ngpos-isa,ngpos-mx,ngpos-mxc,ngpos-payments,ngpos-platform,ngpos-shared,ngpos-tax,prom-monitoring,local-image-registry,edsmongodb,kong-system,ngpos-fuel,mx-offers
```

***

### 🔻 PCI Network `~15m`

```bash
python k8s_cleanup.py --network pci-network-3430=mongodb,elastic-system,rabbitmq-system,ngpos-lab,ngpos-payments-pci,ngpos-shared-pci,prom-monitoring-pci,kong-system-pci,ngpos-fuel-pci-l1
```
***

### 🔻 Fuel Network `~5m`

```bash
python k8s_cleanup.py --network fuel-network-3421=ngpos-fuel-pci-l0,kong-system-fuel,prom-monitoring-fuel,filebeat,ngpos-shared-pci-l0
```

***

> [!NOTE]
> You can run any 2 Network clean up parallely which bascially means you can run any 2 commands from above parallely.


## 🚚 Step 4: Physically Move Clusters

* Perform the physical migration of clusters
* Ensure infrastructure and networking are properly configured

***

## 🧾 Step 5: Update SoT (Post-Migration)

### 🔧 Changes to Make

* Update **DNS IP** to the **Tuna IP of the cluster**
* Set **config sync period** to `15s`
* set isc-apps-replicas to `1`
* In SOT csv row for the cluster where we are making above changes, make sure the destination cluster names are replaced from the stand by cluster.(for example if we are moving from ci001 to ci009, replace all ci001 data with ci009)

### ✅ Finalize

* Commit and push changes
* Merge into the appropriate branch (example ci009 mapped to dev, so merge pr to dev branch)

***

## 🔄 Step 6: Restore Cluster

### ▶️ Run Recovery Script

```bash
python gdce_recovery.py
```

***

## 👀 Post-Recovery Validation

Verify the following components are running properly:

* ✅ Kroger Issuer
* ✅ Namespace Labeler
* ✅ Kong instances
* ✅ Operators
* ✅ Config Management System

💡 Use:

```bash
kubectl get pods -A
```

to monitor status.

***

## ✅ Checklist

* [ ] SoT updated (pre-migration)
* [ ] Cleanup scripts executed
* [ ] Cluster migrated
* [ ] SoT updated (post-migration)
* [ ] Recovery script executed
* [ ] Services validated

***

## 🧑‍💻 Notes

* Double-check branch mappings before merging
* Monitor logs during cleanup and recovery
* Keep rollback strategy ready

