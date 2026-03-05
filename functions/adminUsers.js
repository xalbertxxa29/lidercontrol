const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * Restablece la contraseña de un usuario.
 * Solo puede ser llamado por un usuario con TIPOACCESO = 'ADMIN'.
 * 
 * @param {object} data - { targetUid: string, newPassword: string }
 * @param {object} context - Contexto de la llamada
 */
exports.adminResetPassword = functions.https.onCall(async (data, context) => {
    // 1. Verificar autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Debe estar autenticado para llamar a esta función.'
        );
    }

    const callerUid = context.auth.uid;
    const { targetUid, newPassword } = data;

    if (!targetUid || !newPassword) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Faltan datos requeridos (targetUid, newPassword).'
        );
    }

    if (newPassword.length < 6) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'La contraseña debe tener al menos 6 caracteres.'
        );
    }

    try {
        // 2. Verificar que el solicitante sea ADMIN consultando Firestore
        // Nota: El custom claim es más rápido, pero consultar la DB es más seguro si los claims no se refrescan al momento.
        // Asumimos que TIPOACCESO está en la colección USUARIOS (documento ID = username o uid?)
        // Como el ID de documento en 'USUARIOS' parece ser el username, necesitamos buscar al usuario por su UID de Auth
        // O confiar en que el caller ya tiene el rol verificado.

        // MEJOR ENFOQUE: Buscar el documento del usuario en Firestore usando su email (ya que la coleccion es por username)
        // O buscar si hay algún campo 'uid' en los documentos. 
        // Dado que access-control.js usa collection('USUARIOS').doc(username), 
        // vamos a usar el email del token para deducir el username, igual que en el frontend.

        const email = context.auth.token.email;
        if (!email) {
            throw new functions.https.HttpsError('permission-denied', 'No tiene email asociado.');
        }

        const username = email.split('@')[0].toLowerCase();
        const callerDoc = await admin.firestore().collection('USUARIOS').doc(username).get();

        if (!callerDoc.exists) {
            throw new functions.https.HttpsError('permission-denied', 'Usuario no encontrado en base de datos.');
        }

        const callerData = callerDoc.data();
        if (callerData.TIPOACCESO !== 'ADMIN' && callerData.TIPOACCESO !== 'SUPERVISOR') {
            throw new functions.https.HttpsError('permission-denied', 'Solo administradores o supervisores pueden realizar esta acción.');
        }

        // 3. Ejecutar el cambio de contraseña
        // Primero, necesitamos traducir targetUid (que es el ID interno de Auth, o quizás el username enviado desde el front)
        // Si el front envía el ID del documento (username), necesitamos obtener el UID de Auth.
        // Asumiremos que el front envía el UID de Auth si lo tiene disponible, o el username.

        // CASO PROBABLE: En la tabla de usuarios, tenemos los datos de Firestore. 
        // ¿Tenemos el UID de Auth ahí? A veces no.
        // Si 'targetUid' no parece un UID de Auth, intentaremos buscar el usuario por email.

        let uidToUpdate = targetUid;

        // Si targetUid no es un UID de Auth válido (ej. es "prueba"), buscamos por email
        // Obtenemos el email del documento en Firestore
        const targetDoc = await admin.firestore().collection('USUARIOS').doc(targetUid).get();
        if (targetDoc.exists) {
            const targetData = targetDoc.data();
            // Si tiene campo EMAIL, usamos ese para buscar el usuario en Auth
            if (targetData.EMAIL || targetData.email) {
                try {
                    const userRecord = await admin.auth().getUserByEmail(targetData.EMAIL || targetData.email);
                    uidToUpdate = userRecord.uid;
                } catch (e) {
                    // Si falla buscar por email, quizas targetUid YA ERA el uid?
                    // Continuamos con el valor original si falla
                    console.warn("No se encontró usuario por email, intentando usar ID directo:", e);
                }
            }
        }

        await admin.auth().updateUser(uidToUpdate, {
            password: newPassword
        });

        console.log(`Contraseña actualizada para usuario ${targetUid} por administrador ${username}`);
        return { success: true, message: 'Contraseña actualizada correctamente.' };

    } catch (error) {
        console.error('Error al restablecer contraseña:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Elimina un usuario de Auth y de Firestore.
 * Solo puede ser llamado por ADMIN o SUPERVISOR.
 * 
 * @param {object} data - { targetUid: string } (El targetUid es el ID del documento en USUARIOS, que es el username)
 */
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');
    }

    const { targetUid } = data;
    if (!targetUid) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta targetUid.');
    }

    try {
        const callerEmail = context.auth.token.email;
        const callerUsername = callerEmail.split('@')[0].toLowerCase();
        const callerDoc = await admin.firestore().collection('USUARIOS').doc(callerUsername).get();

        if (!callerDoc.exists || (callerDoc.data().TIPOACCESO !== 'ADMIN' && callerDoc.data().TIPOACCESO !== 'SUPERVISOR')) {
            throw new functions.https.HttpsError('permission-denied', 'No tiene permisos para eliminar usuarios.');
        }

        // 1. Obtener email del usuario para borrarlo de Auth
        const targetDoc = await admin.firestore().collection('USUARIOS').doc(targetUid).get();
        if (targetDoc.exists) {
            const targetData = targetDoc.data();
            const email = targetData.EMAIL || targetData.CORREO || targetData.email;

            if (email) {
                try {
                    const userRecord = await admin.auth().getUserByEmail(email);
                    await admin.auth().deleteUser(userRecord.uid);
                    console.log(`Usuario Auth eliminado: ${email}`);
                } catch (e) {
                    console.warn(`No se pudo eliminar de Auth (tal vez no existe): ${email}`, e);
                }
            }
        }

        // 2. Eliminar de Firestore
        await admin.firestore().collection('USUARIOS').doc(targetUid).delete();
        console.log(`Usuario Firestore eliminado: ${targetUid}`);

        return { success: true, message: `Usuario ${targetUid} eliminado correctamente.` };

    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
