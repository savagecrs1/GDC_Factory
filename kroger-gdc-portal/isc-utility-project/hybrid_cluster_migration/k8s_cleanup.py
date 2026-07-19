#!/usr/bin/env python3

import subprocess
import threading
import time
import sys

WATCH_INTERVAL = 5
RETRY_INTERVAL = 10

NETWORK_NAMESPACES = {}


# -----------------------------
# ✅ Helper
# -----------------------------
def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode().strip()
    except:
        return ""


# -----------------------------
# ✅ Parse args
# -----------------------------
def parse_args():
    if len(sys.argv) == 1:
        print("Use --network net=ns1,ns2")
        sys.exit(1)

    args = sys.argv[1:]
    i = 0

    while i < len(args):
        if args[i] == "--network":
            i += 1
            net, ns = args[i].split("=")
            NETWORK_NAMESPACES[net] = ns.split(",")
        i += 1


# -----------------------------
# ✅ CronJob + Job Handling (NEW)
# -----------------------------
def handle_jobs_and_cronjobs(ns):

    # ✅ Suspend CronJobs
    cronjobs = run(
        f"kubectl get cronjob -n {ns} -o jsonpath='{{.items[*].metadata.name}}'"
    ).split()

    for cj in cronjobs:
        suspend = run(
            f"kubectl get cronjob {cj} -n {ns} -o jsonpath='{{.spec.suspend}}'"
        )

        if suspend != "true":
            run(
                f"kubectl patch cronjob {cj} -n {ns} "
                f"-p '{{\"spec\":{{\"suspend\":true}}}}'"
            )

    # ✅ Stop Jobs
    jobs = run(
        f"kubectl get job -n {ns} -o jsonpath='{{.items[*].metadata.name}}'"
    ).split()

    for job in jobs:
        active = run(
            f"kubectl get job {job} -n {ns} -o jsonpath='{{.status.active}}'"
        )

        if active and active != "0":
            print(f"[NS:{ns}] Stopping Job {job}")

            # Stop execution
            run(
                f"kubectl patch job {job} -n {ns} "
                f"-p '{{\"spec\":{{\"parallelism\":0}}}}'"
            )

            # Delete pods
            pods = run(
                f"kubectl get pods -n {ns} -l job-name={job} "
                f"-o jsonpath='{{.items[*].metadata.name}}'"
            ).split()

            if pods:
                run(
                    f"kubectl delete pod {' '.join(pods)} -n {ns} "
                    f"--force --grace-period=0"
                )


# -----------------------------
# ✅ Patch GGC
# -----------------------------
def patch_ggc(kind, name):
    cmd = (
        f"kubectl patch {kind} {name} "
        f"--type=merge "
        f"-p '{{\"metadata\":{{\"finalizers\":[]}}}}'"
    )
    try:
        subprocess.run(cmd, shell=True,
                       stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL,
                       check=True)
        return True
    except:
        return False


# -----------------------------
# ✅ Patch Pod
# -----------------------------
def patch_pod_finalizer(pod, ns):
    run(
        f"kubectl patch pod {pod} -n {ns} "
        f"-p '{{\"metadata\":{{\"finalizers\":[]}}}}'"
    )


# -----------------------------
# ✅ GGC kind
# -----------------------------
def get_ggc_kind():
    if run("kubectl get ggc"):
        return "ggc"
    if run("kubectl get gkegatewaycidrs"):
        return "gkegatewaycidrs"
    return None


# -----------------------------
# ✅ Gateway check
# -----------------------------
def gateway_exists(network):
    gws = run("kubectl get gateway -n kube-system -o jsonpath='{.items[*].metadata.name}'")
    return any(network in g for g in gws.replace("'", "").split())


# -----------------------------
# ✅ GGC cleanup
# -----------------------------
def remove_ggc_finalizers(network):

    kind = get_ggc_kind()
    if not kind:
        return

    ggcs = run(f"kubectl get {kind} -o jsonpath='{{.items[*].metadata.name}}'")

    for ggc in ggcs.replace("'", "").split():

        if network not in ggc:
            continue

        print(f"[Cleanup] Processing GGC: {ggc}")

        # Step 1: patch
        patch_ggc(kind, ggc)

        # Step 2: wait gateway
        while gateway_exists(network):
            time.sleep(2)

        # Step 3: retry patches
        success = False
        for i in range(5):
            patch_ggc(kind, ggc)

            if not run(f"kubectl get {kind} {ggc}"):
                print(f"[Cleanup] ✅ GGC deleted")
                success = True
                break

            time.sleep(2)

        if not success:
            print(f"\n⚠️ Run manually:\n"
                  f"kubectl patch {kind} {ggc} "
                  f"-p '{{\"metadata\":{{\"finalizers\":[]}}}}'\n")


# -----------------------------
# ✅ Scale EVERYTHING
# -----------------------------
def scale_everything(ns):

    run(f"kubectl scale deploy --all --replicas=0 -n {ns}")
    run(f"kubectl scale sts --all --replicas=0 -n {ns}")

    # ✅ NEW: Jobs + CronJobs control
    handle_jobs_and_cronjobs(ns)

    # DaemonSets
    ds_list = run(
        f"kubectl get ds -n {ns} -o jsonpath='{{.items[*].metadata.name}}'"
    )
    for ds in ds_list.split():
        run(
            f"kubectl patch ds {ds} -n {ns} "
            f"-p '{{\"spec\":{{\"template\":{{\"spec\":{{\"nodeSelector\":{{\"cleanup\":\"true\"}}}}}}}}}}'"
        )


# -----------------------------
# ✅ Watchdog
# -----------------------------
def watchdog():
    while True:
        run("kubectl scale deploy --all -n config-management-system --replicas=0")
        run("kubectl delete pods -n config-management-system --all --force --grace-period=0")
        time.sleep(WATCH_INTERVAL)


# -----------------------------
# ✅ Network Loop
# -----------------------------
def reconciler_loop(net):

    print(f"[Net:{net}] Monitoring...")

    while True:

        if not run(f"kubectl get network {net}"):
            print(f"[Net:{net}] Network deleted ✅")
            remove_ggc_finalizers(net)
            break

        all_clean = True

        for ns in NETWORK_NAMESPACES[net]:

            pods_output = run(f"kubectl get pods -n {ns} --no-headers")
            lines = [l for l in pods_output.splitlines() if l.strip()]

            if not lines:
                print(f"[Net:{net}] {ns} → CLEAN ✅")
            else:
                print(f"[Net:{net}] {ns} → {len(lines)} pods")

            scale_everything(ns)

            if lines:
                all_clean = False

                for line in lines:
                    parts = line.split()
                    pod = parts[0]
                    status = parts[2]

                    # ✅ Fix networking for job pods
                    if status in ["Error", "Failed", "Completed"]:
                        run(
                            f"kubectl annotate pod {pod} -n {ns} "
                            f"networking.gke.io/default-interface- "
                            f"networking.gke.io/interfaces- "
                            f"--overwrite"
                        )

                    # Finalizers
                    if run(
                        f"kubectl get pod {pod} -n {ns} "
                        f"-o jsonpath='{{.metadata.finalizers}}'"
                    ):
                        patch_pod_finalizer(pod, ns)

                    # Delete
                    run(
                        f"kubectl delete pod {pod} -n {ns} "
                        f"--force --grace-period=0"
                    )

        if all_clean:
            print(f"[Net:{net}] ✅ Deleting network")
            run(f"kubectl delete network {net}")

        time.sleep(RETRY_INTERVAL)


# -----------------------------
# ✅ MAIN
# -----------------------------
def main():
    parse_args()

    print("🚀 Starting cleanup...")

    threading.Thread(target=watchdog, daemon=True).start()

    threads = []
    for net in NETWORK_NAMESPACES:
        t = threading.Thread(target=reconciler_loop, args=(net,))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    print("✅ Cleanup completed")


if __name__ == "__main__":
    main()