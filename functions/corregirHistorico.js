const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Copiado de validarRondasIncumplidas.js para consistencia
function contarPuntosMarcados(puntos) {
    if (!puntos) return { total: 0, marcados: 0 };
    const lista = Array.isArray(puntos) ? puntos : Object.values(puntos);
    const total = lista.length;
    const marcados = lista.filter(p => p.qrEscaneado === true).length;
    return { total, marcados };
}

function determinarEstadoSmart(rondaDocData) {
    // Analizar puntos
    const { total, marcados } = contarPuntosMarcados(rondaDocData.puntosRegistrados);

    if (total > 0 && marcados === total) return 'TERMINADA'; // Todo completado
    if (marcados > 0) return 'INCOMPLETA'; // Parcial
    return 'NO REALIZADA'; // Nada hecho
}

// Función HTTP para invocar la corrección manualmente
exports.corregirRondasHistoricas = functions
    .region('southamerica-east1')
    .runWith({
        timeoutSeconds: 540, // 9 minutos (máximo permitido para gen1)
        memory: '1GB'
    })
    .https.onRequest(async (req, res) => {
        try {
            console.log('=== INICIANDO CORRECCIÓN HISTÓRICA DE RONDAS ===');

            const batchSize = 500;
            let totalProcesados = 0;
            let totalActualizados = 0;
            let totalNormalizados = 0; // Solo cambio de nombre de estado
            let totalCerrados = 0;     // Cierre de rondas en progreso

            // Obtener todos los documentos
            // NOTA: Si son muchísimos (>5000), esto podría requerir paginación más compleja.
            // Para este caso asumimos que cabe en memoria o timeout.
            const snapshot = await db.collection('RONDAS_COMPLETADAS').get();

            if (snapshot.empty) {
                return res.json({ message: 'No se encontraron rondas para analizar.' });
            }

            console.log(`Analizando ${snapshot.size} documentos...`);

            let batch = db.batch();
            let operationCounter = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let changes = {};
                let shouldUpdate = false;
                let estadoActual = data.estado || '';

                // 1. NORMALIZACIÓN DE NOMBRES DE ESTADO
                if (estadoActual === 'NO_REALIZADA') {
                    changes.estado = 'NO REALIZADA';
                    shouldUpdate = true;
                    totalNormalizados++;
                } else if (estadoActual === 'INCOMPLETADA') {
                    changes.estado = 'INCOMPLETA';
                    shouldUpdate = true;
                    totalNormalizados++;
                }

                // 2. CIERRE INTELIGENTE DE RONDAS PEGADAS
                // (EN_PROGRESO o EN_PROCESO)
                if (estadoActual === 'EN_PROGRESO' || estadoActual === 'EN_PROCESO') {
                    // Verificar fecha para no cerrar la ronda que se está haciendo AHORA MISMO
                    // Asumimos que si tiene más de 24h de creada, ya debería estar cerrada
                    let fechaDoc = null;

                    if (data.createdAt && data.createdAt.toDate) {
                        fechaDoc = data.createdAt.toDate();
                    } else if (data.timestamp) {
                        fechaDoc = new Date(data.timestamp);
                    } else if (data.fecha) {
                        // "2024-02-12"
                        fechaDoc = new Date(data.fecha);
                    }

                    const ahora = new Date();
                    const horasDiferencia = fechaDoc ? (ahora - fechaDoc) / (1000 * 60 * 60) : 999;

                    // Si tiene más de 12 horas de antigüedad, se fuerza el cierre
                    if (horasDiferencia > 12) {
                        const nuevoEstado = determinarEstadoSmart(data);
                        if (nuevoEstado) {
                            changes.estado = nuevoEstado;
                            changes.observacion = `Corrección histórica automática (Estado anterior: ${estadoActual})`;
                            changes.timestampCierreAutomatico = admin.firestore.FieldValue.serverTimestamp();
                            shouldUpdate = true;
                            totalCerrados++;
                        }
                    }
                }

                // Aplicar cambios al batch
                if (shouldUpdate) {
                    batch.update(doc.ref, changes);
                    operationCounter++;
                    totalActualizados++;
                }

                // Commit cada 500 operaciones
                if (operationCounter >= batchSize) {
                    await batch.commit();
                    console.log(`Commit de batch intermedio (${operationCounter} ops)`);
                    batch = db.batch();
                    operationCounter = 0;
                }

                totalProcesados++;
            }

            // Commit final si quedaron pendientes
            if (operationCounter > 0) {
                await batch.commit();
            }

            const resumen = {
                success: true,
                message: 'Proceso de corrección finalizado',
                detalles: {
                    totalDocumentosAnalizados: totalProcesados,
                    totalDocumentosActualizados: totalActualizados,
                    desglose: {
                        normalizacionNombres: totalNormalizados,
                        cierreAutomaticoRondasViejas: totalCerrados
                    }
                }
            };

            console.log('Resumen:', resumen);
            res.json(resumen);

        } catch (error) {
            console.error('Error en corrección histórica:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
