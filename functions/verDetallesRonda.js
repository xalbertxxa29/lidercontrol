/**
 * CLOUD FUNCTION: Ver detalles de rondas específicas
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/verDetallesRonda?id=ronda_1763692629066
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.verDetallesRonda = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const rondasId = req.query.id;

      if (!rondasId) {
        return res.json({
          error: 'Falta parámetro: ?id=ronda_id'
        });
      }

      const docRef = await db.collection('Rondas_QR').doc(rondasId).get();

      if (!docRef.exists) {
        return res.json({
          error: `No existe ronda con id: ${rondasId}`
        });
      }

      const ronda = docRef.data();

      // Obtener también si existe en RONDAS_COMPLETADAS
      const completadaRef = await db.collection('RONDAS_COMPLETADAS').doc(rondasId).get();

      res.json({
        rondasId,
        exists: true,
        ronda,
        enRondasCompletadas: completadaRef.exists,
        detallesCompletada: completadaRef.exists ? completadaRef.data() : null
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  });
