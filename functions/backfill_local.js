/**
 * Standalone Backfill Script
 * Run this to initialize KPI_SUMMARIES from existing data.
 * Usage: node backfill_local.js
 * (Requires service-account.json in the same folder)
 */

const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runBackfill() {
    console.log("Starting backfill...");
    const snapshot = await db.collection("INCIDENCIAS_REGISTRADAS").get();

    const summary = {
        total: 0,
        by_risk: {},
        by_category: {},
        by_unit: {},
        by_date: {}
    };

    snapshot.forEach(doc => {
        const data = doc.data();
        const risk = data.Nivelderiesgo || "No definido";
        const category = data.tipoIncidente || "Sin Categoría";
        const unit = data.unidad || "Sin Unidad";
        const dateStr = data.timestamp ?
            (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)).toISOString().split('T')[0] :
            "Desconocido";

        summary.total++;
        summary.by_risk[risk] = (summary.by_risk[risk] || 0) + 1;
        summary.by_category[category] = (summary.by_category[category] || 0) + 1;
        summary.by_unit[unit] = (summary.by_unit[unit] || 0) + 1;
        if (dateStr !== "Desconocido") {
            summary.by_date[dateStr] = (summary.by_date[dateStr] || 0) + 1;
        }
    });

    await db.collection("KPI_SUMMARIES").doc("incidents_global").set(summary);
    console.log(`Backfill complete! Processed ${snapshot.size} documents.`);
}

runBackfill().catch(console.error);
