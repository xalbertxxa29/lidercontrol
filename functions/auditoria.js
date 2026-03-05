/**
 * CLOUD FUNCTION: Endpoint HTTP para registrar logs desde el cliente
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/agregarLog
 * 
 * Método: POST
 * Body:
 * {
 *   "tipoAccion": "CREAR|ACTUALIZAR|ELIMINAR",
 *   "coleccion": "nombre_coleccion",
 *   "documentoId": "id_documento",
 *   "usuario": "usuario@ejemplo.com",
 *   "datos": { ... },
 *   "cambios": { "anterior": {...}, "nuevo": {...} },
 *   "descripcion": "descripción de la acción",
 *   "metadatos": { "ipAddress": "...", "navegador": "..." }
 * }
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const logger = require('./logger');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Obtiene la IP del cliente
 */
function obtenerIPCliente(req) {
  return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'N/A').split(',')[0].trim();
}

/**
 * Valida que la acción sea segura
 */
function esAccionValida(tipoAccion) {
  const tiposValidos = Object.values(logger.TIPOS_ACCION);
  return tiposValidos.includes(tipoAccion);
}

/**
 * Valida que el usuario exista
 */
async function existeUsuario(usuario) {
  try {
    const snapshot = await db.collection('USUARIOS').doc(usuario).get();
    return snapshot.exists;
  } catch (e) {
    return true; // Si hay error, permitir (usuario podría ser email o ID)
  }
}

exports.agregarLog = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    // Permitir solo POST
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Solo se permite método POST'
      });
    }

    try {
      const { tipoAccion, coleccion, documentoId, usuario, datos, cambios, descripcion, metadatos } = req.body;

      // Validaciones básicas
      if (!tipoAccion || !coleccion || !documentoId || !usuario) {
        return res.status(400).json({
          success: false,
          error: 'Falta información requerida: tipoAccion, coleccion, documentoId, usuario'
        });
      }

      if (!esAccionValida(tipoAccion)) {
        return res.status(400).json({
          success: false,
          error: `Tipo de acción no válido: ${tipoAccion}`
        });
      }

      // Obtener IP y información del cliente
      const ipCliente = obtenerIPCliente(req);
      const userAgent = req.headers['user-agent'] || 'N/A';

      const logId = await logger.registrarAccion({
        tipoAccion,
        coleccion,
        documentoId,
        usuario,
        datos: datos || {},
        cambios: cambios || null,
        descripcion: descripcion || '',
        metadatos: {
          ipAddress: ipCliente,
          navegador: userAgent,
          plataforma: 'web',
          ...metadatos
        }
      });

      return res.json({
        success: true,
        message: 'Log registrado exitosamente',
        logId
      });

    } catch (error) {
      console.error('Error registrando log:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Obtiene el historial de auditoría de un documento
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerHistorial?coleccion=RONDAS_COMPLETADAS&documentoId=ronda_xxx&limite=50
 */
exports.obtenerHistorial = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const { coleccion, documentoId, limite } = req.query;

      if (!coleccion || !documentoId) {
        return res.status(400).json({
          success: false,
          error: 'Falta información: coleccion, documentoId'
        });
      }

      const historial = await logger.obtenerHistorialDocumento(
        coleccion,
        documentoId,
        parseInt(limite) || 50
      );

      return res.json({
        success: true,
        coleccion,
        documentoId,
        cantidad: historial.length,
        historial
      });

    } catch (error) {
      console.error('Error obteniendo historial:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Obtiene logs por usuario
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorUsuario?usuario=usuario@ejemplo.com&limite=100
 */
exports.obtenerLogsPorUsuario = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const { usuario, limite } = req.query;

      if (!usuario) {
        return res.status(400).json({
          success: false,
          error: 'Falta parámetro: usuario'
        });
      }

      const logs = await logger.obtenerLogsPorUsuario(usuario, parseInt(limite) || 100);

      return res.json({
        success: true,
        usuario,
        cantidad: logs.length,
        logs
      });

    } catch (error) {
      console.error('Error obteniendo logs:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Obtiene logs por tipo de acción
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorTipoAccion?tipoAccion=CREAR&limite=100
 */
exports.obtenerLogsPorTipoAccion = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const { tipoAccion, limite } = req.query;

      if (!tipoAccion) {
        return res.status(400).json({
          success: false,
          error: 'Falta parámetro: tipoAccion'
        });
      }

      const logs = await logger.obtenerLogsPorTipoAccion(tipoAccion, parseInt(limite) || 100);

      return res.json({
        success: true,
        tipoAccion,
        cantidad: logs.length,
        logs
      });

    } catch (error) {
      console.error('Error obteniendo logs:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

/**
 * Obtiene logs por colección
 * URL: https://southamerica-east1-incidencias-85d73.cloudfunctions.net/obtenerLogsPorColeccion?coleccion=RONDAS_COMPLETADAS&limite=100
 */
exports.obtenerLogsPorColeccion = functions
  .region('southamerica-east1')
  .https
  .onRequest(async (req, res) => {
    try {
      const { coleccion, limite } = req.query;

      if (!coleccion) {
        return res.status(400).json({
          success: false,
          error: 'Falta parámetro: coleccion'
        });
      }

      const logs = await logger.obtenerLogsPorColeccion(coleccion, parseInt(limite) || 100);

      return res.json({
        success: true,
        coleccion,
        cantidad: logs.length,
        logs
      });

    } catch (error) {
      console.error('Error obteniendo logs:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
