/**
 * ALERTS.JS - Funciones para alertar sobre rondas incumplidas
 * (Desactivada temporalmente - trigger de Firestore en construcción)
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// FUNCIÓN DESACTIVADA - Será reactivada cuando se complete la migración
// exports.alertarRondaIncumplida = functions...
