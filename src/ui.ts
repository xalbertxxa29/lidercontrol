// ============================================================
// UI HELPERS — Toasts, dialogs, loaders, modals
// ============================================================

export const UI = {
    // Global loading overlay
    showLoader(msg = 'Cargando sistema…', sub = 'Por favor espera', percentage?: number) {
        const el = document.getElementById('global-loader');
        if (!el) return;

        el.classList.remove('hidden', 'closing');

        const h3 = el.querySelector('h3');
        const p = el.querySelector('p');
        if (h3) h3.textContent = msg;
        if (p) p.textContent = sub;

        const bar = document.getElementById('loaderBar');
        if (bar) {
            if (percentage !== undefined) {
                bar.parentElement!.style.display = 'block';
                bar.style.width = `${percentage}%`;
            } else {
                bar.parentElement!.style.display = 'none';
            }
        }
    },

    hideLoader() {
        const el = document.getElementById('global-loader');
        if (!el || el.classList.contains('hidden')) return;

        // Apply closing animation (3s as requested)
        el.classList.add('closing');

        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('closing');
        }, 3000);
    },

    // Toast notification
    toast(msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
        const el = document.getElementById('toast');
        if (!el) return;

        // Icon based on type
        const icons = {
            success: `<svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
            warning: `<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        };

        el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:20px;height:20px">${icons[type]}</div>
        <div>${msg}</div>
      </div>
    `;

        el.classList.add('show');
        if ((this as any)._tTimer) clearTimeout((this as any)._tTimer);
        (this as any)._tTimer = setTimeout(() => el.classList.remove('show'), 3500);
    },

    // Confirmation dialog
    dialog(title: string, message: string, onConfirm: () => void, type: 'warning' | 'danger' | 'info' = 'warning', confirmText = 'Confirmar') {
        const el = document.getElementById('dialog');
        if (!el) return;

        document.getElementById('dialogTitle')!.textContent = title;
        document.getElementById('dialogMessage')!.textContent = message;

        const iconEl = document.getElementById('dialogIcon')!;
        if (type === 'danger') {
            iconEl.style.background = 'rgba(239,68,68,0.15)';
            iconEl.style.borderColor = 'rgba(239,68,68,0.3)';
            iconEl.style.color = '#ef4444';
            iconEl.innerHTML = '!';
        } else if (type === 'info') {
            iconEl.style.background = 'rgba(14,165,233,0.15)';
            iconEl.style.borderColor = 'rgba(14,165,233,0.3)';
            iconEl.style.color = '#0ea5e9';
            iconEl.innerHTML = 'i';
        } else {
            iconEl.style.background = 'rgba(245,158,11,0.15)';
            iconEl.style.borderColor = 'rgba(245,158,11,0.3)';
            iconEl.style.color = '#f59e0b';
            iconEl.innerHTML = '?';
        }

        const actions = document.getElementById('dialogActions')!;
        actions.innerHTML = `
      <button class="btn btn-secondary" id="dialogCancelBtn">Cancelar</button>
      <button class="btn btn-${type === 'warning' ? 'primary' : type}" id="dialogConfirmBtn">${confirmText}</button>
    `;

        el.classList.add('show');

        document.getElementById('dialogCancelBtn')!.onclick = () => el.classList.remove('show');
        document.getElementById('dialogConfirmBtn')!.onclick = () => {
            el.classList.remove('show');
            onConfirm();
        };
    }
};
