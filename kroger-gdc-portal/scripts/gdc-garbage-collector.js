const { execSync } = require('child_process');

const MAX_AGE_HOURS = 2;
const SWEEP_INTERVAL_MS = 2 * 60 * 60 * 1000; // Run every 2 hours

function log(msg) {
  console.log(`[GDC Garbage Collector] [${new Date().toISOString()}] ${msg}`);
}

async function runGarbageCollectionSweep() {
  log("Starting organization-wide stale GDC resource sweep...");
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const envPath = `${process.env.PATH || ''}:${homeDir}/google-cloud-sdk/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
    const projOut = execSync('gcloud projects list --limit=50 --format="json(projectId)"', {
      encoding: 'utf-8',
      env: { ...process.env, PATH: envPath }
    });
    const projects = JSON.parse(projOut || '[]').map(p => p.projectId);

    for (const project of projects) {
      if (project === 'kroger-test-4') continue; // Preserved project

      // 1. Check GCE VM instances
      try {
        const vmOut = execSync(`gcloud compute instances list --project="${project}" --format="json(name, zone, creationTimestamp, status)" --quiet`, {
          encoding: 'utf-8',
          env: { ...process.env, PATH: envPath }
        });
        const vms = JSON.parse(vmOut || '[]');

        for (const vm of vms) {
          if (vm.name.startsWith('autotest-') || vm.name.startsWith('kroger-store-') || vm.name === 'gem-admin-ws') {
            const ageMs = Date.now() - new Date(vm.creationTimestamp).getTime();
            const ageHours = ageMs / (1000 * 60 * 60);

            if (ageHours > MAX_AGE_HOURS) {
              log(`Found stale VM "${vm.name}" in project "${project}" (Zone: ${vm.zone}, Age: ${ageHours.toFixed(1)}h). Deleting...`);
              const zoneName = vm.zone.split('/').pop();
              try {
                execSync(`gcloud compute instances update ${vm.name} --no-deletion-protection --project="${project}" --zone="${zoneName}" --quiet`, { stdio: 'ignore', env: { ...process.env, PATH: envPath } });
              } catch (_) {}
              execSync(`gcloud compute instances delete ${vm.name} --project="${project}" --zone="${zoneName}" --quiet`, { stdio: 'ignore', env: { ...process.env, PATH: envPath } });
              log(`✅ Purged stale VM "${vm.name}".`);
            }
          }
        }
      } catch (e) {
        // Ignored if compute API not enabled
      }

      // 2. Check GKE Fleet memberships
      try {
        const memOut = execSync(`gcloud container fleet memberships list --project="${project}" --format="json(name, createTime)" --quiet`, {
          encoding: 'utf-8',
          env: { ...process.env, PATH: envPath }
        });
        const memberships = JSON.parse(memOut || '[]');

        for (const m of memberships) {
          const name = m.name?.split('/')?.pop();
          if (name && (name.startsWith('autotest-') || name.startsWith('kroger-') || name.startsWith('abm-') || name.startsWith('cnuc-'))) {
            const ageMs = m.createTime ? Date.now() - new Date(m.createTime).getTime() : MAX_AGE_HOURS + 1;
            const ageHours = ageMs / (1000 * 60 * 60);

            if (ageHours > MAX_AGE_HOURS) {
              log(`Found stale GKE Fleet Membership "${name}" in project "${project}" (Age: ${ageHours.toFixed(1)}h). Unregistering...`);
              execSync(`gcloud container fleet memberships delete ${name} --project="${project}" --quiet`, { stdio: 'ignore', env: { ...process.env, PATH: envPath } });
              log(`✅ Unregistered stale membership "${name}".`);
            }
          }
        }
      } catch (e) {
        // Ignored if fleet API not enabled
      }
    }
    log("Sweep complete.");
  } catch (err) {
    log(`Sweep error: ${err.message}`);
  }
}

// Perform initial sweep on startup
runGarbageCollectionSweep();

// Schedule recurring sweep every 2 hours
setInterval(runGarbageCollectionSweep, SWEEP_INTERVAL_MS);
