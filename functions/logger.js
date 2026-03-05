/**
 * MÓDULO: Logger de Auditoría
 * Propósito: Registrar todas las acciones en la colección 'logs'
 * Incluye: usuario, tipo de acción, colección afectada, cambios realizados, timestamp, etc.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Tipos de acción permitidos
 */
const TIPOS_ACCION = {
  CREAR: 'CREAR',
  ACTUALIZAR: 'ACTUALIZAR',
  ELIMINAR: 'ELIMINAR',
  ESTADO_CAMBIO: 'ESTADO_CAMBIO',
  ESCANEO_QR: 'ESCANEO_QR',
  FOTO_AGREGADA: 'FOTO_AGREGADA',
  VALIDACION_AUTOMATICA: 'VALIDACION_AUTOMATICA',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  EXPORTAR: 'EXPORTAR',
  CONSULTA: 'CONSULTA'
};

/**
 * Registra una acción en la colección 'logs'
 * 
 * @param {string} tipoAccion - Tipo de acción (CREAR, ACTUALIZAR, ELIMINAR, etc.)
 * @param {string} coleccion - Nombre de la colección afectada
 * @param {string} documentoId - ID del documento afectado
 * @param {object} datos - Datos relacionados con la acción
 * @param {string} usuario - Email o ID del usuario que realizó la acción
 * @param {object} cambios - (Opcional) Objeto con 'anterior' y 'nuevo' para comparativas
 * @param {string} descripcion - (Opcional) Descripción detallada de la acción
 * @param {object} metadatos - (Opcional) Información adicional (IP, navegador, etc.)
 * 
 * @returns {Promise<string>} ID del documento de log creado
 */
async function registrarAccion({
  tipoAccion,
  coleccion,
  documentoId,
  datos = {},
  usuario = 'SISTEMA',
  cambios = null,
  descripcion = '',
  metadatos = {}
}) {
  try {
    // Validar tipo de acción
    if (!Object.values(TIPOS_ACCION).includes(tipoAccion)) {
      console.warn(`⚠️ Tipo de acción no reconocido: ${tipoAccion}`);
    }

    // Obtener hora actual
    const ahora = new Date();
    const ahoraLocal = new Date(ahora.getTime() - 5 * 60 * 60 * 1000); // UTC-5

    // Construir documento de log
    const logDocument = {
      // Información básica
      tipoAccion,
      coleccion,
      documentoId,
      usuario: usuario || 'SISTEMA',

      // Datos afectados
      datos: datos || {},

      // Cambios (si aplica)
      ...(cambios && {
        cambios: {
          anterior: cambios.anterior || null,
          nuevo: cambios.nuevo || null
        }
      }),

      // Descripción
      descripcion: descripcion || `${tipoAccion} en ${coleccion}`,

      // Timestamps
      timestamp: admin.firestore.Timestamp.now(),
      timestampLegible: ahoraLocal.toISOString(),
      fecha: `${ahoraLocal.getFullYear()}-${String(ahoraLocal.getMonth() + 1).padStart(2, '0')}-${String(ahoraLocal.getDate()).padStart(2, '0')}`,
      hora: `${String(ahoraLocal.getHours()).padStart(2, '0')}:${String(ahoraLocal.getMinutes()).padStart(2, '0')}:${String(ahoraLocal.getSeconds()).padStart(2, '0')}`,

      // Metadatos
      metadatos: {
        ipAddress: metadatos.ipAddress || 'N/A',
        navegador: metadatos.navegador || 'N/A',
        plataforma: metadatos.plataforma || 'web',
        ...metadatos
      },

      // Información del sistema
      sistema: 'weblidercontrol',
      version: '1.0'
    };

    // Guardar en Firestore
    const docRef = await db.collection('logs').add(logDocument);

    console.log(`✅ Log registrado: ${docRef.id}`);
    console.log(`   Acción: ${tipoAccion}`);
    console.log(`   Usuario: ${usuario}`);
    console.log(`   Documento: ${coleccion}/${documentoId}`);

    return docRef.id;

  } catch (error) {
    console.error(`❌ Error registrando log:`, error);
    throw error;
  }
}

/**
 * Registra un cambio de estado de una ronda
 * @param {string} rondasId - ID de la ronda
 * @param {string} estadoAnterior - Estado anterior
 * @param {string} estadoNuevo - Estado nuevo
 * @param {string} usuario - Usuario que realizó el cambio
 * @param {string} razon - Razón del cambio
 */
async function registrarCambioEstadoRonda(rondasId, estadoAnterior, estadoNuevo, usuario, razon = '') {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.ESTADO_CAMBIO,
    coleccion: 'RONDAS_COMPLETADAS',
    documentoId: rondasId,
    usuario,
    cambios: {
      anterior: { estado: estadoAnterior },
      nuevo: { estado: estadoNuevo }
    },
    descripcion: `Estado de ronda cambió de "${estadoAnterior}" a "${estadoNuevo}"${razon ? ': ' + razon : ''}`,
    datos: {
      rondasId,
      estadoAnterior,
      estadoNuevo,
      razon
    }
  });
}

/**
 * Registra la creación de un documento
 * @param {string} coleccion - Colección del documento
 * @param {string} documentoId - ID del documento
 * @param {object} datosCreados - Datos del documento creado
 * @param {string} usuario - Usuario que creó el documento
 */
async function registrarCreacion(coleccion, documentoId, datosCreados, usuario = 'SISTEMA') {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.CREAR,
    coleccion,
    documentoId,
    usuario,
    datos: datosCreados,
    descripcion: `Nuevo documento creado en ${coleccion}`
  });
}

/**
 * Registra la actualización de un documento
 * @param {string} coleccion - Colección del documento
 * @param {string} documentoId - ID del documento
 * @param {object} datosAnteriores - Datos antes del cambio
 * @param {object} datosNuevos - Datos después del cambio
 * @param {string} usuario - Usuario que actualizó el documento
 */
async function registrarActualizacion(coleccion, documentoId, datosAnteriores, datosNuevos, usuario = 'SISTEMA') {
  // Calcular solo los cambios realizados
  const camposModificados = {};
  
  for (const key in datosNuevos) {
    if (JSON.stringify(datosAnteriores[key]) !== JSON.stringify(datosNuevos[key])) {
      camposModificados[key] = {
        anterior: datosAnteriores[key],
        nuevo: datosNuevos[key]
      };
    }
  }

  return registrarAccion({
    tipoAccion: TIPOS_ACCION.ACTUALIZAR,
    coleccion,
    documentoId,
    usuario,
    cambios: {
      anterior: datosAnteriores,
      nuevo: datosNuevos
    },
    datos: {
      camposModificados,
      cantidadCambios: Object.keys(camposModificados).length
    },
    descripcion: `Documento actualizado: ${Object.keys(camposModificados).join(', ')}`
  });
}

/**
 * Registra la eliminación de un documento
 * @param {string} coleccion - Colección del documento
 * @param {string} documentoId - ID del documento
 * @param {object} datoEliminado - Datos del documento eliminado
 * @param {string} usuario - Usuario que eliminó el documento
 */
async function registrarEliminacion(coleccion, documentoId, datoEliminado, usuario = 'SISTEMA') {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.ELIMINAR,
    coleccion,
    documentoId,
    usuario,
    datos: datoEliminado,
    descripcion: `Documento eliminado de ${coleccion}`
  });
}

/**
 * Registra una validación automática del sistema
 * @param {string} coleccion - Colección validada
 * @param {string} documentoId - ID del documento
 * @param {string} resultado - Resultado de la validación
 * @param {object} detalles - Detalles de la validación
 */
async function registrarValidacionAutomatica(coleccion, documentoId, resultado, detalles = {}) {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.VALIDACION_AUTOMATICA,
    coleccion,
    documentoId,
    usuario: 'SISTEMA_AUTOMATICO',
    datos: {
      resultado,
      detalles
    },
    descripcion: `Validación automática: ${resultado}`
  });
}

/**
 * Registra un escaneo de QR
 * @param {string} rondasId - ID de la ronda
 * @param {string} puntoId - ID del punto escaneado
 * @param {string} usuario - Usuario que escaneó
 * @param {string} codigoQR - Código QR escaneado
 */
async function registrarEscaneoQR(rondasId, puntoId, usuario, codigoQR) {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.ESCANEO_QR,
    coleccion: 'RONDAS_COMPLETADAS',
    documentoId: rondasId,
    usuario,
    datos: {
      rondasId,
      puntoId,
      codigoQR
    },
    descripcion: `Código QR escaneado en punto ${puntoId}`
  });
}

/**
 * Registra la adición de una foto
 * @param {string} rondasId - ID de la ronda
 * @param {string} puntoId - ID del punto
 * @param {string} usuario - Usuario que agregó la foto
 * @param {string} urlFoto - URL de la foto
 */
async function registrarFotoAgregada(rondasId, puntoId, usuario, urlFoto) {
  return registrarAccion({
    tipoAccion: TIPOS_ACCION.FOTO_AGREGADA,
    coleccion: 'RONDAS_COMPLETADAS',
    documentoId: rondasId,
    usuario,
    datos: {
      rondasId,
      puntoId,
      urlFoto
    },
    descripcion: `Foto agregada en punto ${puntoId}`
  });
}

/**
 * Obtiene el historial de logs de un documento
 * @param {string} coleccion - Colección del documento
 * @param {string} documentoId - ID del documento
 * @param {number} limite - Cantidad de registros a obtener (default 50)
 */
async function obtenerHistorialDocumento(coleccion, documentoId, limite = 50) {
  try {
    const snapshot = await db.collection('logs')
      .where('coleccion', '==', coleccion)
      .where('documentoId', '==', documentoId)
      .orderBy('timestamp', 'desc')
      .limit(limite)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error(`❌ Error obteniendo historial:`, error);
    return [];
  }
}

/**
 * Obtiene logs por usuario
 * @param {string} usuario - Email o ID del usuario
 * @param {number} limite - Cantidad de registros a obtener
 */
async function obtenerLogsPorUsuario(usuario, limite = 100) {
  try {
    const snapshot = await db.collection('logs')
      .where('usuario', '==', usuario)
      .orderBy('timestamp', 'desc')
      .limit(limite)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error(`❌ Error obteniendo logs:`, error);
    return [];
  }
}

/**
 * Obtiene logs por tipo de acción
 * @param {string} tipoAccion - Tipo de acción
 * @param {number} limite - Cantidad de registros a obtener
 */
async function obtenerLogsPorTipoAccion(tipoAccion, limite = 100) {
  try {
    const snapshot = await db.collection('logs')
      .where('tipoAccion', '==', tipoAccion)
      .orderBy('timestamp', 'desc')
      .limit(limite)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error(`❌ Error obteniendo logs:`, error);
    return [];
  }
}

/**
 * Obtiene logs por colección
 * @param {string} coleccion - Nombre de la colección
 * @param {number} limite - Cantidad de registros a obtener
 */
async function obtenerLogsPorColeccion(coleccion, limite = 100) {
  try {
    const snapshot = await db.collection('logs')
      .where('coleccion', '==', coleccion)
      .orderBy('timestamp', 'desc')
      .limit(limite)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error(`❌ Error obteniendo logs:`, error);
    return [];
  }
}

// Exportar funciones
module.exports = {
  // Funciones principales
  registrarAccion,
  registrarCambioEstadoRonda,
  registrarCreacion,
  registrarActualizacion,
  registrarEliminacion,
  registrarValidacionAutomatica,
  registrarEscaneoQR,
  registrarFotoAgregada,

  // Funciones de consulta
  obtenerHistorialDocumento,
  obtenerLogsPorUsuario,
  obtenerLogsPorTipoAccion,
  obtenerLogsPorColeccion,

  // Constantes
  TIPOS_ACCION
};
