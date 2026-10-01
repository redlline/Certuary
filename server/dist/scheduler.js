import cron from "node-cron";
import { scanAllServers } from "./services/certScanner.js";
import { checkExpiryAndNotify } from "./services/expiryAlerts.js";
import { checkAllLiveCertificates } from "./services/tlsCheck.js";
export function startScheduler() {
    // every 6 hours: full re-scan, then alert check, then live TLS check
    cron.schedule("0 */6 * * *", async () => {
        try {
            await scanAllServers();
            await checkExpiryAndNotify();
            await checkAllLiveCertificates();
        }
        catch (err) {
            console.error("Scheduled job failed", err);
        }
    });
    // every 30 minutes: just alert check, in case thresholds are crossed between full scans
    cron.schedule("*/30 * * * *", () => {
        checkExpiryAndNotify().catch((err) => console.error("Expiry alert check failed", err));
    });
}
//# sourceMappingURL=scheduler.js.map