/**
 * LIDERCONTROL - CLOUD FUNCTIONS INDEX (V1 Compat)
 * Toda la lógica consolidada en Gen 1 para máxima compatibilidad.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Opciones de región comunes
const REGION = 'southamerica-east1';

/**
 * ============================================================================
 * 1. FUNCIONES DE OPTIMIZACIÓN (AGREGACIÓN) - V1
 * ============================================================================
 */

/**
 * Trigger: Al crear una incidencia
 * Actualiza estadísticas globales en tiempo real
 */
exports.aggregateIncident = functions
    .region(REGION)
    .firestore.document('INCIDENCIAS_REGISTRADAS/{docId}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        if (!data) return;

        const summaryRef = db.collection('KPI_SUMMARIES').doc('incidents_global');

        const risk = (data.Nivelderiesgo || 'No definido').toUpperCase();
        const category = data.tipoIncidente || 'Sin Categoría';
        const unit = data.unidad || 'Sin Unidad';
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : new Date());
        const dateStr = timestamp.toISOString().split('T')[0];

        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(summaryRef);
                const current = doc.exists ? doc.data() : {
                    total: 0,
                    by_risk: {},
                    by_category: {},
                    by_unit: {},
                    by_date: {}
                };

                current.total = (current.total || 0) + 1;

                if (!current.by_risk) current.by_risk = {};
                current.by_risk[risk] = (current.by_risk[risk] || 0) + 1;

                if (!current.by_category) current.by_category = {};
                current.by_category[category] = (current.by_category[category] || 0) + 1;

                if (!current.by_unit) current.by_unit = {};
                current.by_unit[unit] = (current.by_unit[unit] || 0) + 1;

                if (!current.by_date) current.by_date = {};
                current.by_date[dateStr] = (current.by_date[dateStr] || 0) + 1;

                transaction.set(summaryRef, current);
            });
            console.log(`✅ Incidencia ${context.params.docId} agregada exitosamente.`);
        } catch (error) {
            console.error('❌ Error en agregación:', error);
        }
    });

/**
 * Callable: Carga inicial de estadísticas (Backfill)
 */
exports.backfillStats = functions
    .region(REGION)
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Debes estar autenticado.');
        }

        console.log('Iniciando backfill de estadísticas...');
        const snapshot = await db.collection('INCIDENCIAS_REGISTRADAS').get();

        const summary = {
            total: 0,
            by_risk: {},
            by_category: {},
            by_unit: {},
            by_date: {}
        };

        snapshot.forEach(doc => {
            const d = doc.data();
            const risk = (d.Nivelderiesgo || 'No definido').toUpperCase();
            const category = d.tipoIncidente || 'Sin Categoría';
            const unit = d.unidad || 'Sin Unidad';
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : (d.timestamp ? new Date(d.timestamp) : null);

            summary.total++;
            summary.by_risk[risk] = (summary.by_risk[risk] || 0) + 1;
            summary.by_category[category] = (summary.by_category[category] || 0) + 1;
            summary.by_unit[unit] = (summary.by_unit[unit] || 0) + 1;

            if (ts) {
                const dateStr = ts.toISOString().split('T')[0];
                summary.by_date[dateStr] = (summary.by_date[dateStr] || 0) + 1;
            }
        });

        await db.collection('KPI_SUMMARIES').doc('incidents_global').set(summary);
        return { success: true, processed: snapshot.size };
    });

/**
 * ============================================================================
 * 2. FUNCIONES MIGRADAS DE WEBANTIGUA
 * ============================================================================
 */

// Validación de Rondas
exports.validarRondasDiarias = require('./validarRondasDiarias').validarRondasDiarias;
exports.validarRondasDiariasHTTP = require('./validarRondasDiarias').validarRondasDiariasHTTP;
exports.validarRondasIncumplidas = require('./validarRondasIncumplidas').validarRondasIncumplidas;
exports.validarRondasManual = require('./validarManual').validarRondasManual;

// Utilidades
exports.crearRondaEn2Min = require('./crearRondaEn2Min').crearRondaEn2Min;
exports.verDetallesRonda = require('./verDetallesRonda').verDetallesRonda;

// Admin
exports.adminResetPassword = require('./adminUsers').adminResetPassword;
exports.adminDeleteUser = require('./adminUsers').adminDeleteUser;
exports.corregirRondasHistoricas = require('./corregirHistorico').corregirRondasHistoricas;

/**
 * Diagnóstico
 */
exports.diagnostico = functions
    .region(REGION)
    .https.onCall(async (data, context) => {
        const colecciones = await db.listCollections();
        return {
            encontradas: colecciones.map(c => c.id),
            timestamp: new Date().toISOString()
        };
    });
