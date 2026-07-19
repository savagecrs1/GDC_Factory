#!/usr/bin/env python3

import subprocess
import json
from collections import defaultdict

BACKUP_FILE = "replica-backup.json"
REPORT_FILE = "rehydration-report.txt"

# -------------------------------
# Helpers
# -------------------------------

def run(cmd, ignore_error=True):
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            check=not ignore_error,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def log(msg):
    print(msg)
    with open(REPORT_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def all_pods_ready(namespace):
    cmd = [
        "kubectl", "get", "pods",
        "-n", namespace,
        "-o", "json"
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )

        data = json.loads(result.stdout)
        pods = data.get("items", [])

        # ✅ NEW: Check if no pods exist
        if not pods:
            return False

        for pod in pods:
            # Check pod phase
            if pod.get("status", {}).get("phase") != "Running":
                return False

            # Check container readiness
            statuses = pod.get("status", {}).get("containerStatuses", [])

            # ✅ FIX: remove incorrect "if not pod" check
            if not statuses:
                return False

            for c in statuses:
                if not c.get("ready", False):
                    return False

        return True

    except Exception:
        return False

def rs_cleanup(ns):
    return run(f"kubectl delete rs --all -n {ns}")

def ns_exists(ns):
    return run(f"kubectl get ns {ns}") != ""

def webhook_exists(webhook):
    return run(f"kubectl get mutatingwebhookconfiguration {webhook}") != ""

def delete_webhook(webhook):
    run(f"kubectl delete mutatingwebhookconfiguration {webhook}")

def restart_deployments(ns):
    log(f">> Restarting deployments in {ns}")
    run(f"kubectl delete pods --all -n {ns}")
    run(f"kubectl rollout restart deployment -n {ns}")

def restart_sts(ns):
    log(f">> Restarting statefulsets in {ns}")
    run(f"kubectl rollout restart statefulset -n {ns}")


def scale_deployments(ns, replicas):
    log(f">> Scaling deployments in {ns} to {replicas}")
    run(f"kubectl scale deployment --all --replicas={replicas} -n {ns}")


def get_pods(ns):
    out = run(f"kubectl get pods -n {ns} --no-headers")
    return [line.split()[0] for line in out.splitlines() if line]


def is_job_pod(ns, pod):
    owners = run(f"kubectl get pod {pod} -n {ns} -o jsonpath='{{.metadata.ownerReferences[*].kind}}'")
    return "Job" in owners


def is_error_pod(ns, pod):
    out = run(f"kubectl get pod {pod} -n {ns} --no-headers")
    return "Error" in out


# ✅ FINAL DELETE LOGIC (optimized batch mode)
def delete_with_timeout_and_force(ns):
    log(f"Deleting pods in {ns} with timeout 40s")

    run(f"kubectl delete pods --all -n {ns} --timeout=40s")

    pods = get_pods(ns)
    if not pods:
        log(f"All pods deleted in {ns}")
        return

    eligible = []

    for pod in pods:
        if is_job_pod(ns, pod):
            log(f"Skipping Job pod {pod}")
            continue

        if is_error_pod(ns, pod):
            log(f"Skipping Error pod {pod}")
            continue

        eligible.append(pod)

    if not eligible:
        log(f"No eligible pods to force delete in {ns}")
        return

    log(f"Force deleting {len(eligible)} pods in {ns}")

    pod_list = " ".join(eligible)

    # remove finalizers (batch)
    run(
        f"kubectl patch pod {pod_list} -n {ns} "
        f"-p '{{\"metadata\":{{\"finalizers\":[]}}}}' --type=merge",
        True
    )

    # force delete (batch)
    run(
        f"kubectl delete pod {pod_list} -n {ns} "
        f"--force --grace-period=0",
        True
    )


# ✅ GROUPED SCALING
def scale_from_backup_grouped():
    log("STEP 7: Scaling workloads (grouped)")

    try:
        with open(BACKUP_FILE) as f:
            data = json.load(f)

        groups = defaultdict(list)

        for item in data:
            if item.get("action") != "scale":
                continue

            ns = item["namespace"]
            kind = item["kind"].lower()
            name = item["name"]
            replicas = item["replicas"]

            if not ns_exists(ns):
                continue

            groups[(ns, kind, replicas)].append(name)

        for (ns, kind, replicas), names in groups.items():
            name_list = " ".join(names)

            log(f"Scaling {kind} in {ns} to {replicas} (count={len(names)})")

            run(
                f"kubectl scale {kind} {name_list} -n {ns} --replicas={replicas}"
            )

    except Exception:
        log("Backup file missing or invalid")


# -------------------------------
# STEP 0: Cleanup (Error Pods Grouped)
# -------------------------------
log("STEP 1: Cleaning problematic pods")

cleanup_ns = [
    "config-management-system","namespace-labeler","rabbitmq-system",
    "elastic-system","mongodb","es","kroger-issuer",
    "kong-system","kong-system-default","kong-system-pci",
    "kong-system-fuel","dns-config"
]

for ns in cleanup_ns:
    if not ns_exists(ns):
        continue

    # ✅ Get only problematic pods
    out = run(f"kubectl get pods -n {ns} --no-headers")

    problematic = []

    for line in out.splitlines():
        if any(x in line for x in ["CrashLoopBackOff", "Completed", "Evicted", "Error"]):
            pod = line.split()[0]
            problematic.append(pod)

    if not problematic:
        continue

    log(f"Deleting {len(problematic)} problematic pods in {ns}")

    pod_list = " ".join(problematic)

    run(
        f"kubectl delete pod {pod_list} -n {ns} --force --grace-period=0",
        True
    )

# -------------------------------
# STEP 1A: webhook
# -------------------------------
log("Checking namespace labeler webhook exist before its deployments")
if ns_exists("namespace-labeler") and not all_pods_ready("namespace-labeler"):
    if webhook_exists("namespace-labeler"):
        delete_webhook("namespace-labeler")
        rs_cleanup("namespace-labeler")
        scale_deployments("namespace-labeler", 2)
        restart_deployments("namespace-labeler")
    else:
        rs_cleanup("namespace-labeler")
        scale_deployments("namespace-labeler", 2)
        restart_deployments("namespace-labeler")
    
    log("Deleted webhook, it will be created again from Config Sync")

# -------------------------------
# STEP 1B: DNS
# -------------------------------
if ns_exists("dns-config"):
    rs_cleanup("dns-config")
    restart_deployments("dns-config")

# -------------------------------
# STEP 2: Infra
# -------------------------------
log("STEP 2: Infra recovery")

if ns_exists("config-management-system"):
    rs_cleanup("config-management-system")
    scale_deployments("config-management-system", 1)
    restart_deployments("config-management-system")

infra_ns = ["rabbitmq-system","elastic-system","mongodb","es"]

for ns in infra_ns:
    if not ns_exists(ns):
        continue

    if ns == "elastic-system":
        sts_list = run(
            "kubectl get sts -n elastic-system "
            "-o jsonpath='{range .items[*]}{.metadata.name} {.spec.replicas}{\"\\n\"}{end}'"
        ).replace("'","").splitlines()

        for line in sts_list:
            name, replicas = line.split()
            if replicas == "0":
                log(f"Scaling STS {name} to 1")
                run(f"kubectl scale sts {name} -n {ns} --replicas=1")

        restart_sts(ns)
    else:
        rs_cleanup(ns)
        restart_deployments(ns)


# -------------------------------
# STEP 3: Issuer
# -------------------------------
if ns_exists("kroger-issuer"):
    rs_cleanup("kroger-issuer")
    scale_deployments("kroger-issuer", 1)
    restart_deployments("kroger-issuer")


log("checking if namespace-labeler webhook exists")
while True:
    if webhook_exists("namespace-labeler"):
        log(f"namespace-labeler Webhook exists")
        break   
    else:
        run(f"sleep 310")
        restart_deployments("config-management-system")
        continue

# -------------------------------
# STEP 4: Kong
# -------------------------------
kong_ns = [
    "kong-system-default","kong-system",
    "kong-system-pci","kong-system-fuel"
]

for ns in kong_ns:
    if ns_exists(ns):
        run(f"kubectl delete secret kong-default-tls -n {ns} --ignore-not-found")
        rs_cleanup(ns)
        scale_deployments(ns, 1)
        restart_deployments(ns)


# -------------------------------
# STEP 5: Gateway validation
# -------------------------------
for ns in kong_ns:
    if not ns_exists(ns):
        continue

    gws = run(f"kubectl get gateway -n {ns} -o jsonpath='{{.items[*].metadata.name}}'").split()

    for gw in gws:
        prog = run(f"kubectl get gateway {gw} -n {ns} -o jsonpath='{{.status.conditions[?(@.type==\"Programmed\")].status}}'")
        addr = run(f"kubectl get gateway {gw} -n {ns} -o jsonpath='{{.status.addresses}}'")

        if prog != "True" or addr in ["","[]"]:
            log(f"Deleting bad gateway {gw} in {ns}")
            run(f"kubectl delete gateway {gw} -n {ns}")


# -------------------------------
# STEP 6: Workloads reset
# -------------------------------
targets = [
    "ping-auth","ngpos-shared","ngpos-shared-pci","ngpos-lab","ngpos-payments-pci","prom-monitoring-pci",
    "ngpos-fuel-pci-l1","ngpos-apex","ngpos-dev","ngpos-isa",
    "ngpos-mx","ngpos-mxc","ngpos-payments","ngpos-platform","ngpos-tax","prom-monitoring","local-image-registry",
    "edsmongodb","ngpos-fuel","mx-offers","ngpos-fuel-pci-l0",
    "filebeat","prom-monitoring-fuel"
]

for ns in targets:
    if ns_exists(ns):
        log(f"Processing namespace: {ns}")
        delete_with_timeout_and_force(ns)
        run(f"kubectl delete svc --all -n {ns}")


# -------------------------------
# STEP 7: Restore replicas
# -------------------------------
scale_from_backup_grouped()


# -------------------------------
# STEP 8: Final restart
# -------------------------------
if ns_exists("config-management-system"):
    restart_deployments("config-management-system")

# -------------------------------
# STEP 4: Kong
# -------------------------------
kong_ns = [
    "kong-system-default","kong-system",
    "kong-system-pci","kong-system-fuel"
]

for ns in kong_ns:
    if ns_exists(ns):
        scale_deployments(ns, 1)


# -------------------------------
# STEP 9: Health check
# -------------------------------
log("STEP 9: Final health check")

out = run("kubectl get pods -A")

for line in out.splitlines():
    if any(x in line for x in ["Error","CrashLoopBackOff","Pending"]):
        log(line)

log("==== REHYDRATION COMPLETE ====")