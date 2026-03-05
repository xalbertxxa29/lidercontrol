import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

const form = document.getElementById('loginForm') as HTMLFormElement;
const emailInput = document.getElementById('loginEmail') as HTMLInputElement;
const passInput = document.getElementById('loginPass') as HTMLInputElement;
const errorEl = document.getElementById('loginError') as HTMLDivElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const btnText = loginBtn.querySelector('.btn-text') as HTMLElement;
const btnSpinner = loginBtn.querySelector('.btn-spinner') as HTMLElement;
const togglePass = document.getElementById('togglePass') as HTMLButtonElement;

// Toggle password visibility
togglePass?.addEventListener('click', () => {
    const isText = passInput.type === 'text';
    passInput.type = isText ? 'password' : 'text';
    togglePass.innerHTML = isText
        ? `<svg id="eyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg id="eyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
});

// Set loading state
function setLoading(loading: boolean) {
    loginBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : '';
    btnSpinner.style.display = loading ? '' : 'none';
}

// Show error
function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.style.display = '';
}

// Animation particles
const particles = document.getElementById('particles');
if (particles) {
    for (let i = 0; i < 20; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `
      position:absolute;
      width:${2 + Math.random() * 3}px;
      height:${2 + Math.random() * 3}px;
      border-radius:50%;
      background:rgba(79,142,247,${0.2 + Math.random() * 0.4});
      top:${Math.random() * 100}%;
      left:${Math.random() * 100}%;
      animation: floatDot ${6 + Math.random() * 6}s ease-in-out infinite alternate;
      animation-delay:${-Math.random() * 6}s;
    `;
        particles.appendChild(dot);
    }
}

const style = document.createElement('style');
style.textContent = `@keyframes floatDot {
  from { transform: translate(0,0) scale(1); opacity: 0.5; }
  to   { transform: translate(${Math.random() > 0.5 ? '' : '-'}${20 + Math.random() * 30}px, ${Math.random() > 0.5 ? '' : '-'}${20 + Math.random() * 30}px) scale(1.5); opacity: 1; }
}`;
document.head.appendChild(style);

// Form submit
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const pass = passInput.value;

    if (!email || !pass) {
        showError('Por favor ingresa tu correo y contraseña.');
        return;
    }

    setLoading(true);
    errorEl.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // Redirect to app
        window.location.href = 'app.html';
    } catch (err: any) {
        let msg = 'Error al iniciar sesión. Verifica tus credenciales.';
        if (err.code === 'auth/user-not-found') msg = 'Usuario no encontrado.';
        else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Contraseña incorrecta.';
        else if (err.code === 'auth/too-many-requests') msg = 'Demasiados intentos. Intenta más tarde.';
        else if (err.code === 'auth/network-request-failed') msg = 'Error de conexión. Verifica tu internet.';
        showError(msg);
        setLoading(false);
    }
});
