/**
 * CLOUD FUNCTION: Crear ronda que vence en 2 minutos
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/crearRondaEn2Min
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.crearRondaEn2Min = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const ahora = new Date();
      const en2Min = new Date(ahora.getTime() + 2 * 60000);
      const horas = String(en2Min.getHours()).padStart(2, '0');
      const minutos = String(en2Min.getMinutes()).padStart(2, '0');

      const rondaTesteo = {
        nombre: 'RONDA_TEST_2MIN',
        cliente: 'TEST',
        unidad: 'TEST',
        horario: `${horas}:${minutos}`,
        tolerancia: 0,
        frecuencia: 'diaria',
        createdAt: admin.firestore.Timestamp.now(),
        activa: true,
        puntosRonda: {
          0: {
            nombre: 'Punto Test 2Min',
            codigoQR: 'TEST_QR_2MIN',
            qrEscaneado: false
          }
        }
      };

      await db.collection('Rondas_QR').doc('ronda_test_2min').set(rondaTesteo);

      res.json({
        success: true,
        mensaje: 'Ronda creada - Vencerá en 2 minutos',
        ronda: rondaTesteo,
        ahora: ahora.toISOString(),
        horaVencimiento: `${horas}:${minutos}`,
        instrucciones: [
          '1. Esta ronda vencerá en 2 minutos',
          '2. Espera 2+ minutos',
          '3. Accede a: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/validarRondasManual',
          '4. Deberías ver "ronda_test_2min" como INCUMPLIDA',
          '5. El documento se creará en RONDAS_COMPLETADAS con estado: NO REALIZADA'
        ]
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  });
