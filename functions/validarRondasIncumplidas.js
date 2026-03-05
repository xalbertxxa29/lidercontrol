/**
 * CLOUD FUNCTION: validarRondasIncumplidas
 * Propósito: Validar automáticamente las rondas que no fueron completadas dentro del tiempo permitido
 * Ejecución: Scheduled (cada 5 minutos)
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const logger = require('./logger');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Zona horaria: Perú/Argentina UTC-5
// UTC-5 significa 5 horas ANTES que UTC
// Si en UTC es 01:01, en UTC-5 es 20:01 del día anterior
const ZONA_HORARIA_OFFSET = -5; // horas desde UTC

function obtenerAhoraEnZonaLocal() {
  const ahora = new Date();
  // RESTAR 5 horas para convertir de UTC a UTC-5
  const offset = ZONA_HORARIA_OFFSET * 60 * 60 * 1000; // -5 horas en ms
  const ahoraLocal = new Date(ahora.getTime() + offset); // offset ya es negativo
  return ahoraLocal;
}

function formatearFecha(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function formatearFechaConGuionesBajos(fecha) {
  /**
   * Formato para IDs de documentos: YYYY_MM_DD
   * Ejemplo: 2025_11_30
   */
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}_${mes}_${dia}`;
}

function formatearFechaConHora(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  const segundos = String(fecha.getSeconds()).padStart(2, '0');
  return `${año}-${mes}-${dia}_${horas}:${minutos}:${segundos}`;
}

function debeEjecutarseHoy(ronda, fechaHoy) {
  // Si no tiene frecuencia especificada, asumir que debe validarse
  if (!ronda.frecuencia) return true;

  const frecuencia = (ronda.frecuencia || '').toLowerCase().trim();

  // Validar si la frecuencia coincide con hoy
  // Diaria: siempre
  if (frecuencia.includes('diaria') || frecuencia === 'diario') {
    return true;
  }

  // Semanal: validar día de la semana (si está configurado)
  if (frecuencia.includes('semanal') || frecuencia === 'semanal') {
    // Por ahora asumir que se debe validar
    return true;
  }

  // Si tiene cualquier otra frecuencia, validar
  return true;
}

/**
 * Verifica que la ronda sea del día actual
 * Esto evita marcar como incumplidas rondas de días anteriores
 */
function esRondaDeHoy(ronda, ahora = new Date()) {
  if (!ronda.createdAt) return true; // Si no tiene fecha, asumir que es de hoy

  let fechaCreacion;

  // Manejar tanto Timestamp de Firestore como Date regular
  if (ronda.createdAt.toDate) {
    fechaCreacion = ronda.createdAt.toDate();
  } else if (ronda.createdAt instanceof Date) {
    fechaCreacion = ronda.createdAt;
  } else {
    return true;
  }

  // Convertir fechaCreacion a zona local (UTC-5)
  const offset = ZONA_HORARIA_OFFSET * 60 * 60 * 1000;
  const fechaCreacionLocal = new Date(fechaCreacion.getTime() + offset);

  const fechaHoyFormato = formatearFecha(ahora);
  const fechaCreacionFormato = formatearFecha(fechaCreacionLocal);

  const esHoy = fechaHoyFormato === fechaCreacionFormato;
  console.log(`    Validación de fecha: Hoy=${fechaHoyFormato}, Creación=${fechaCreacionFormato}, EsHoy=${esHoy}`);

  return esHoy;
}

function verificarTiempoLimite(horaFin, toleranciaMinutos = 0, ahora = new Date()) {
  if (!horaFin) return { tiempoLimiteAlcanzado: false, minutosRestantes: 0 };

  const partes = horaFin.split(':');
  if (partes.length < 2) return { tiempoLimiteAlcanzado: false, minutosRestantes: 0 };

  const [horas, minutos] = partes.map(Number);

  const tiempoLimite = new Date(ahora);
  tiempoLimite.setHours(horas, minutos, 0, 0);
  tiempoLimite.setMinutes(tiempoLimite.getMinutes() + toleranciaMinutos);

  const ahoraTime = ahora.getTime();
  const tiempoLimiteTime = tiempoLimite.getTime();
  const minutosRestantes = Math.ceil((tiempoLimiteTime - ahoraTime) / 60000);

  return {
    tiempoLimiteAlcanzado: ahoraTime > tiempoLimiteTime,
    minutosRestantes
  };
}

async function registrarRondasIncumplidas(rondasIncumplidas) {
  const timestamp = new Date().toISOString();
  let registradas = 0;

  for (const { rondasId, ronda, fecha } of rondasIncumplidas) {
    try {
      // Obtener hora de inicio (de la ronda)
      let horaInicio = ronda.horarioInicio || ronda.hora_inicio || '';
      let horaTermino = ronda.horario || ronda.hora_fin || ronda.horarioTermino || '';
      let horaRondaProgramada = ronda.horario || ''; // Horario programado de la ronda (para horarioRonda)
      let tolerancia = ronda.tolerancia || ronda.tolerancia_minutos || 0;

      // Crear timestamps para horarioInicio y horarioTermino
      // SOLUCIÓN CORRECTA: Usar Date.UTC para evitar problemas de zona horaria
      const ahora_utc = new Date();

      // horarioInicio: cuando debió comenzar la ronda (hoy a la hora indicada en Perú, convertida a UTC)
      const inicioPartes = horaTermino.split(':');  // Usar horaTermino (horario programado) no horaInicio
      let timestampInicio = new Date(ahora_utc);

      if (inicioPartes.length >= 2) {
        const horasInt = parseInt(inicioPartes[0]);
        const minutosInt = parseInt(inicioPartes[1]);

        // CORRECCIÓN: Usar Date.UTC para crear fecha correcta
        // Si en Perú (UTC-5) son las 18:10, en UTC son las 23:10
        timestampInicio = new Date(Date.UTC(
          ahora_utc.getUTCFullYear(),
          ahora_utc.getUTCMonth(),
          ahora_utc.getUTCDate(),
          horasInt + 5,  // Sumar 5 horas para convertir hora local Perú a UTC
          minutosInt,
          0,
          0
        ));

        // Log para verificar que se está guardando correctamente
        console.log(`   📍 horarioRonda (valor string): ${horaRondaProgramada}`);
        console.log(`   📍 Hora en Perú (hora local): ${horasInt}:${String(minutosInt).padStart(2, '0')}`);
        console.log(`   📍 timestampInicio en UTC: ${timestampInicio.toUTCString()}`);
      }

      // horarioTermino: cuando debió terminar (timestampInicio + tolerancia)
      const timestampTermino = new Date(timestampInicio);
      timestampTermino.setUTCMinutes(timestampTermino.getUTCMinutes() + tolerancia);

      // Crear estructura de documento incumplido
      let puntosRegistrados = {};

      if (ronda.puntosRonda && typeof ronda.puntosRonda === 'object') {
        // Si es un objeto, convertir a array
        const puntosArray = Array.isArray(ronda.puntosRonda)
          ? ronda.puntosRonda
          : Object.values(ronda.puntosRonda);

        puntosArray.forEach((punto, index) => {
          puntosRegistrados[index] = {
            nombre: punto.nombre || punto.descripcion || `Punto ${index + 1}`,
            codigoQR: punto.codigoQR || punto.codigo || '',
            qrEscaneado: false,
            foto: null,
            timestamp
          };
        });
      } else {
        // Si no hay puntos, crear uno genérico
        puntosRegistrados[0] = {
          nombre: ronda.nombre || 'Punto General',
          codigoQR: '',
          qrEscaneado: false,
          foto: null,
          timestamp
        };
      }

      const documentoIncumplida = {
        cliente: ronda.cliente || '',
        unidad: ronda.unidad || '',
        usuario: ronda.usuario || ronda.agente || '',
        estado: 'NO REALIZADA',
        horarioInicio: admin.firestore.Timestamp.fromDate(timestampInicio),
        horarioTermino: admin.firestore.Timestamp.fromDate(timestampTermino),
        horarioRonda: horaRondaProgramada,
        rondasId: rondasId,
        nombre: ronda.nombre || '',
        puntosRegistrados,
        createdAt: admin.firestore.Timestamp.now(),
        timestamp,
        fecha: fecha
      };

      // Generar ID único con fecha y hora de la ronda
      // FORMATO: rondaId_YYYY_MM_DD_HHMM (con guiones bajos, no guiones)
      let horaRondaFormato = '0000'; // default
      if (horaTermino) {
        const horaPartes = horaTermino.split(':');
        if (horaPartes.length >= 2) {
          const horas = String(parseInt(horaPartes[0])).padStart(2, '0');
          const minutos = String(parseInt(horaPartes[1])).padStart(2, '0');
          horaRondaFormato = `${horas}${minutos}`;
        }
      }

      // Usar el nuevo formato con guiones bajos para consistencia
      const fechaFormato = formatearFechaConGuionesBajos(ahora);
      const docIdUnico = `${rondasId}_${fechaFormato}_${horaRondaFormato}`;

      // ✅ VERIFICACIÓN CRÍTICA: Verificar si el documento ya existe
      const docExistente = await db.collection('RONDAS_COMPLETADAS').doc(docIdUnico).get();

      if (docExistente.exists) {
        const estadoExistente = docExistente.data().estado;

        // ✅ PROTECCIÓN: Si ya existe y está TERMINADA, NO sobrescribir
        if (estadoExistente === 'TERMINADA' || estadoExistente === 'COMPLETADA') {
          console.log(`⚠️  PROTECCIÓN: Documento ${docIdUnico} ya está ${estadoExistente}. No se sobrescribe.`);
          registradas++;
          continue;
        }

        // Si existe pero está NO REALIZADA, actualizar (no es problema)
        if (estadoExistente === 'NO REALIZADA') {
          console.log(`ℹ️  Documento ${docIdUnico} ya existe como NO REALIZADA. Se mantiene.`);
          registradas++;
          continue;
        }
      }

      // Guardar en RONDAS_COMPLETADAS con ID único que incluye fecha/hora
      // Solo si NO existe o si no está TERMINADA
      await db.collection('RONDAS_COMPLETADAS').doc(docIdUnico).set(documentoIncumplida, { merge: false });

      console.log(`✓ Ronda incumplida registrada: ${docIdUnico}`);

      // ✅ REGISTRAR LOG DE AUDITORÍA
      try {
        await logger.registrarValidacionAutomatica(
          'RONDAS_COMPLETADAS',
          docIdUnico,
          'NO_REALIZADA',
          {
            razon: 'Ronda incumplida - validación automática cada 5 minutos',
            rondasId: rondasId,
            rondaNombre: ronda.nombre,
            horarioProgramado: horaTermino,
            tolerancia: tolerancia,
            cliente: ronda.cliente,
            unidad: ronda.unidad,
            usuario: ronda.usuario || ronda.agente,
            fecha: fecha
          }
        );
      } catch (logError) {
        console.error(`   ⚠️ Error registrando log de auditoría:`, logError.message);
        // Continuar aunque falle el log
      }

      registradas++;
    } catch (error) {
      console.error(`✗ Error registrando ronda ${rondasId}:`, error.message);
    }
  }

  return registradas;
}

// Función auxiliar para obtener ayer en zona local
function obtenerAyerEnZonaLocal() {
  const hoy = obtenerAhoraEnZonaLocal();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  return ayer;
}

// Función para contar puntos marcados
function contarPuntosMarcados(puntos) {
  if (!puntos) return { total: 0, marcados: 0 };

  // Si es un objeto (mapa), convertir valores
  const lista = Array.isArray(puntos) ? puntos : Object.values(puntos);
  const total = lista.length;
  // Contar cuántos tienen qrEscaneado = true
  const marcados = lista.filter(p => p.qrEscaneado === true).length;

  return { total, marcados };
}

// Función CORE: Determinar estado Smart Closure
function determinarEstadoSmart(rondaDocData) {
  // Si ya tiene estado final, no tocar
  if (['TERMINADA', 'COMPLETADA', 'INCOMPLETA', 'NO REALIZADA'].includes(rondaDocData.estado)) {
    return null; // No cambia
  }

  // Si no es EN_PROCESO ni EN_PROGRESO, y no es final... (raro), asumir NO REALIZADA
  if (rondaDocData.estado !== 'EN_PROCESO' && rondaDocData.estado !== 'EN_PROGRESO') {
    return 'NO REALIZADA';
  }

  // Analizar puntos
  const { total, marcados } = contarPuntosMarcados(rondaDocData.puntosRegistrados);

  if (total > 0 && marcados === total) return 'TERMINADA'; // Olvidó finalizar
  if (marcados > 0) return 'INCOMPLETA'; // Hizo algunos
  return 'NO REALIZADA'; // No hizo nada
}


exports.validarRondasIncumplidas = functions
  .region('southamerica-east1')
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('=== INICIO: Validar Rondas Incumplidas (Smart Closure) ===');

    const ahora = obtenerAhoraEnZonaLocal();
    const ayer = obtenerAyerEnZonaLocal();

    // Fechas formato string
    const fechaHoy = formatearFecha(ahora);
    const fechaAyer = formatearFecha(ayer);

    console.log(`Hora local: ${ahora.toISOString()}`);
    console.log(`Validando para HOY (${fechaHoy}) y AYER (${fechaAyer})`);

    try {
      // 1. Obtener definición de rondas
      const rondasSnapshot = await db.collection('Rondas_QR').get();
      if (rondasSnapshot.empty) return console.log('Sin rondas definidas.');

      let actualizaciones = 0;
      let registradasAyer = 0;

      // Iterar sobre las definiciones de ronda
      for (const docRondaDef of rondasSnapshot.docs) {
        const def = docRondaDef.data();
        const rondasId = docRondaDef.id;

        const horaFin = def.horario || def.hora_fin || def.horarioTermino;
        const tolerancia = def.tolerancia || 0;

        if (!horaFin) continue;

        // ===================================
        // A. VALIDAR HOY (Smart Closure)
        // ===================================
        if (debeEjecutarseHoy(def, fechaHoy)) {
          // Verificar si YA PASÓ la hora límite de hoy
          const checkHoy = verificarTiempoLimite(horaFin, tolerancia, ahora);

          if (checkHoy.tiempoLimiteAlcanzado) {
            // Buscar documentos EXISENTES de hoy para esta ronda
            const docsHoy = await db.collection('RONDAS_COMPLETADAS')
              .where('rondasId', '==', rondasId)
              .where('fecha', '==', fechaHoy)
              .get();

            if (!docsHoy.empty) {
              // Ya existe documento -> Aplicar Smart Closure
              for (const d of docsHoy.docs) {
                const data = d.data();
                const nuevoEstado = determinarEstadoSmart(data);

                if (nuevoEstado) {
                  console.log(`🔄 Actualizando ronda HOY ${d.id}: ${data.estado} -> ${nuevoEstado}`);
                  await d.ref.update({
                    estado: nuevoEstado,
                    timestampCierreAutomatico: admin.firestore.FieldValue.serverTimestamp(),
                    observacion: 'Cierre automático por tiempo límite (Smart Closure)'
                  });
                  actualizaciones++;
                }
              }
            } else {
              // NO existe documento y ya pasó la hora -> Crear NO REALIZADA
              // (Esta parte usualmente la hace validarRondasDiarias, pero como respaldo está bien)
              console.log(`⚠️ Ronda HOY vencida y sin documento: ${rondasId}. Dejando a validarRondasDiarias.`);
            }
          }
        }

        // ===================================
        // B. VALIDAR AYER (The 24h Clean)
        // ===================================
        // Verificar si debió ejecutarse ayer (asumimos frecuencia diaria o validamos fecha)
        // Para simplificar, si es DIARIA siempre toca ayer.
        const frecuencia = (def.frecuencia || '').toLowerCase();
        let tocaAyer = frecuencia.includes('diaria') || frecuencia === 'diario';

        // Si no es diaria, habría que ver si ayer (día semana) tocaba, pero asumiremos diaria por ahora
        // o si frecuencia incluye el nombre del día de ayer.

        if (tocaAyer) {
          // Chequear documentos de AYER
          const docsAyer = await db.collection('RONDAS_COMPLETADAS')
            .where('rondasId', '==', rondasId)
            .where('fecha', '==', fechaAyer)
            .get();

          if (docsAyer.empty) {
            // NO se creó documento ayer -> Crear NO REALIZADA RETROACTIVA
            console.log(`Creating FALTA para ayer: ${rondasId}`);
            const rondasIncumplidas = [{ rondasId, ronda: def, fecha: fechaAyer }]; // Reutilizamos funcion
            await registrarRondasIncumplidas(rondasIncumplidas); // Ojo: ajustar fecha interna
            registradasAyer++;
          } else {
            // SÍ existe documento ayer -> Aplicar Smart Closure (por si quedó EN_PROCESO)
            for (const d of docsAyer.docs) {
              const data = d.data();
              const nuevoEstado = determinarEstadoSmart(data);

              if (nuevoEstado) {
                console.log(`🔄 Limpiando ronda AYER ${d.id}: ${data.estado} -> ${nuevoEstado}`);
                await d.ref.update({
                  estado: nuevoEstado,
                  timestampCierreAutomatico: admin.firestore.FieldValue.serverTimestamp(),
                  observacion: 'Limpieza automática 24h (Smart Closure)'
                });
                actualizaciones++;
              }
            }
          }
        }
      }

      console.log(`Resumen: ${actualizaciones} actualizaciones Smart Closure, ${registradasAyer} faltas ayer creadas.`);
      return null;

    } catch (error) {
      console.error('Error en loop:', error);
      return null;
    }
  });
