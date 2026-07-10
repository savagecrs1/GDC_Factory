# 🎨 GDC UX & Navigation Staging Sandbox (Port 3002)

This is a dedicated, safe sandbox environment specifically isolated for testing UI layouts, navigation hierarchy, theme modifications, and component prototypes **without risking any disruption to live bare-metal clusters or active GCP provisioning pipelines**.

## 🛡️ Why This Sandbox is 100% Safe:
1. **Isolated Port (3002)**: Runs independently on `http://localhost:3002`, completely separate from `gdc-factory-template` (Port 3000) and `kroger-gdc-portal` (Port 3001).
2. **Locked Emulated Mode (`mode: "emulated"`)**: By default, this UI is locked into Offline Simulation Mode. Clicking **Deploy**, **Destroy**, or **Force Stop** will only trigger simulated in-memory telemetry waterfalls and visual animations. It will **never** execute real `terraform`, `ansible`, or `gcloud` commands.

## 🚀 How to Launch Locally:
```bash
cd gdc-ux-sandbox/ui
npm run dev
```
Open **`http://localhost:3002`** in your browser and experiment freely!
