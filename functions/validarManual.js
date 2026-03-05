/**
 * CLOUD FUNCTION: Ejecutar manualmente validación de rondas (HTTP)
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/validarRondasManual
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function verificarTiempoLimite(horaFin, toleranciaMinutos = 0, ahora = new Date()) {
  const [horas, minutos] = horaFin.split(':').map(Number);
  const tiempoLimite = new Date(ahora);
  tiempoLimite.setHours(horas, minutos, 0, 0);
  tiempoLimite.setMinutes(tiempoLimite.getMinutes() + toleranciaMinutos);
  const ahoraTime = ahora.getTime();
  const tiempoLimiteTime = tiempoLimite.getTime();
  return {
    tiempoLimiteAlcanzado: ahoraTime > tiempoLimiteTime,
    minutosRestantes: Math.ceil((tiempoLimiteTime - ahoraTime) / 60000)
  };
}

exports.validarRondasManual = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const hoy = formatearFecha(new Date());
      const rondasSnapshot = await db.collection('Rondas_QR').get();

      if (rondasSnapshot.empty) {
        return res.json({
          success: false,
          error: 'No hay rondas en Rondas_QR',
          fecha: hoy
        });
      }

      let detalles = [];
      let rondasValidadas = 0;
      let rondasRegistradas = 0;

      for (const doc of rondasSnapshot.docs) {
        const ronda = doc.data();
        const rondasId = doc.id;
        rondasValidadas++;

        let horaFin = ronda.horario || ronda.hora_fin || ronda.horarioTermino;
        let tolerancia = ronda.tolerancia || ronda.tolerancia_minutos || 0;

        const detalle = {
          rondasId,
          nombre: ronda.nombre || 'Sin nombre',
          horaFin: horaFin || 'N/A',
          tolerancia: tolerancia,
          checks: []
        };

        // Validar horario
        if (!horaFin) {
          detalle.razon = 'Sin horario';
          detalle.checks.push('❌ No tiene horario');
          detalles.push(detalle);
          continue;
        }

        detalle.checks.push('✅ Tiene horario');

        // Validar frecuencia
        const frecuencia = (ronda.frecuencia || '').toLowerCase().trim();
        if (!frecuencia || !frecuencia.includes('diaria')) {
          detalle.razon = `Frecuencia no es DIARIA: ${ronda.frecuencia}`;
          detalle.checks.push(`❌ Frecuencia "${ronda.frecuencia}" no es DIARIA`);
          detalles.push(detalle);
          continue;
        }
        detalle.checks.push('✅ Frecuencia es DIARIA');

        // Verificar tiempo límite
        const ahora = new Date();
        const { tiempoLimiteAlcanzado, minutosRestantes } = verificarTiempoLimite(
          horaFin,
          tolerancia,
          ahora
        );

        if (!tiempoLimiteAlcanzado) {
          detalle.razon = `Faltan ${minutosRestantes} minutos`;
          detalle.checks.push(`⏳ Tiempo límite no alcanzado (faltan ${minutosRestantes} min)`);
          detalles.push(detalle);
          continue;
        }
        detalle.checks.push(`✅ Tiempo límite alcanzado (${Math.abs(minutosRestantes)} min atrás)`);

        // Verificar si existe en RONDAS_COMPLETADAS
        try {
          const rondasCompletadasRef = await db
            .collection('RONDAS_COMPLETADAS')
            .doc(rondasId)
            .get();

          if (rondasCompletadasRef.exists) {
            detalle.razon = 'Ya existe en RONDAS_COMPLETADAS';
            detalle.checks.push('✅ Ya registrada en RONDAS_COMPLETADAS');
            detalles.push(detalle);
            continue;
          }
        } catch (e) {
          console.log('Error checking RONDAS_COMPLETADAS:', e.message);
        }

        detalle.razon = 'INCUMPLIDA - Será registrada';
        detalle.checks.push('🔴 NO COMPLETADA - Se registrará como INCUMPLIDA');
        rondasRegistradas++;
        detalles.push(detalle);
      }

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        fecha: hoy,
        rondasValidadas,
        rondasRegistradas,
        detalles
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

