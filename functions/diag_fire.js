const functions = require('firebase-functions');
console.log('Firebase Functions Keys:', Object.keys(functions));
try {
    console.log('functions.region type:', typeof functions.region);
} catch (e) {
    console.log('Error accessing functions.region:', e.message);
}
if (functions.v1) {
    console.log('functions.v1 available. Keys:', Object.keys(functions.v1));
    console.log('functions.v1.region type:', typeof functions.v1.region);
}
