// ============================================================
// APP ENTRY POINT — Router and Session Initialization
// ============================================================

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { accessControl } from './access-control';
import { UI } from './ui';
import './globals';
import $ from 'jquery';
import moment from 'moment';

// Import Views
import { initKPIView } from './views/KPI';
import { initUsuariosView } from './views/Usuarios';
import { initClienteUnidadView } from './views/ClienteUnidad';
import { initCuadernoView } from './views/Cuaderno';
import { initIncidenciasView } from './views/Incidencias';
import { initTiempoConexionView } from './views/TiempoConexion';
import { initTipoIncidenciasView } from './views/TipoIncidencias';
import { initCrearQRView } from './views/CrearQR';
import { initCrearRondasView } from './views/CrearRondas';
// ...

// Import Modals
import { initModals } from './components/Modals';

// App Shell HTML structure
const SHELL_HTML = `
  <div class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-logo">
        <img src="logo.webp" alt="LiderControl" style="width: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 0 8px rgba(0, 240, 255, 0.4));" />
      </div>
      <div class="sidebar-title">LiderControl</div>
    </div>
    
    <nav class="sidebar-nav" id="sidebarNav">
      <!-- Nav items injected here based on role -->
    </nav>
    
    <div class="sidebar-footer">
      <button id="logoutBtn" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Cerrar Sesión</span>
      </button>
    </div>
  </div>

  <div class="main-content">
    <header class="topbar">
      <div class="topbar-title" id="topbarTitle">Dashboard</div>
      <div class="user-pill">
        <div class="user-avatar" id="userAvatar">U</div>
        <div class="user-info">
          <span class="user-name" id="userNameLabel">Usuario</span>
          <span class="user-role" id="userRoleLabel">Cargando...</span>
        </div>
      </div>
    </header>

    <main class="views-container" id="viewsContainer">
      <!-- Views injected here -->
      <div id="view-kpi" class="view"></div>
      <div id="view-usuarios" class="view"></div>
      <div id="view-cliente-unidad" class="view"></div>
      <div id="view-tipo-incidencias" class="view"></div>
      <div id="view-cuaderno" class="view"></div>
      <div id="view-incidencias" class="view"></div>
      <div id="view-tiempo-conexion" class="view"></div>
      <div id="view-crear-qr" class="view"></div>
      <div id="view-crear-rondas" class="view"></div>
    </main>
  </div>
`;

// Sidebar definition
const NAV_ITEMS = [
  { id: 'view-kpi', label: 'KPI', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
  { id: 'view-usuarios', label: 'Usuarios', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  { id: 'view-cliente-unidad', label: 'Cliente / Unidad', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
  { id: 'view-tipo-incidencias', label: 'Tipo Incidencias', icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
  { id: 'view-cuaderno', label: 'Cuaderno', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  { id: 'view-incidencias', label: 'Incidencias', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  { id: 'view-tiempo-conexion', label: 'Tiempo de conexión', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }
];

// App State
let currentView = '';

async function renderSidebar() {
  const navContainer = document.getElementById('sidebarNav')!;
  let html = '';

  NAV_ITEMS.forEach(item => {
    if (accessControl.canView(item.id)) {
      html += `<button class="nav-item" data-view="${item.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}
        <span class="nav-item-label">${item.label}</span>
      </button>`;
    }
  });

  // Rondas Submenu
  if (accessControl.canView('view-crear-qr') || accessControl.canView('view-crear-rondas')) {
    html += `
      <div class="nav-group">
        <button class="nav-group-header" id="rondasMenuBtn">
          <div class="nav-left">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span class="nav-item-label">Rondas</span>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="nav-submenu" id="rondasSubmenu">
          ${accessControl.canView('view-crear-qr') ? `<button class="nav-subitem" data-view="view-crear-qr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="3"/><rect x="14" y="7" width="3" height="3"/><rect x="7" y="14" width="3" height="3"/><rect x="14" y="14" width="3" height="3"/></svg>Crear QR</button>` : ''}
          ${accessControl.canView('view-crear-rondas') ? `<button class="nav-subitem" data-view="view-crear-rondas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Crear Rondas</button>` : ''}
        </div>
      </div>
    `;
  }

  navContainer.innerHTML = html;

  // Add event listeners
  navContainer.querySelectorAll('.nav-item, .nav-subitem').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const vid = (e.currentTarget as HTMLElement).dataset.view;
      if (vid) switchView(vid);
    });
  });

  const rondasBtn = document.getElementById('rondasMenuBtn');
  if (rondasBtn) {
    rondasBtn.addEventListener('click', () => {
      rondasBtn.classList.toggle('open');
      document.getElementById('rondasSubmenu')?.classList.toggle('open');
    });
  }
}

function switchView(viewId: string) {
  if (currentView === viewId) return;

  // Highlight nav
  document.querySelectorAll('.nav-item.active, .nav-subitem.active').forEach(e => e.classList.remove('active'));
  const btn = document.querySelector(`[data-view="${viewId}"]`);
  if (btn) btn.classList.add('active');

  // Show view
  document.querySelectorAll('.view.active').forEach(e => e.classList.remove('active'));
  const viewEl = document.getElementById(viewId);
  if (viewEl) viewEl.classList.add('active');

  // Update topbar title
  const title = (btn?.querySelector('.nav-item-label') || btn)?.textContent || 'Dashboard';
  document.getElementById('topbarTitle')!.textContent = title;

  currentView = viewId;

  // Initialize view module if not already initialized
  if (viewId === 'view-kpi') initKPIView();
  if (viewId === 'view-usuarios') initUsuariosView();
  if (viewId === 'view-cliente-unidad') initClienteUnidadView();
  if (viewId === 'view-cuaderno') initCuadernoView();
  if (viewId === 'view-incidencias') initIncidenciasView();
  if (viewId === 'view-tiempo-conexion') initTiempoConexionView();
  if (viewId === 'view-tipo-incidencias') initTipoIncidenciasView();
  if (viewId === 'view-crear-qr') initCrearQRView();
  if (viewId === 'view-crear-rondas') initCrearRondasView();
}

// Check auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  try {
    UI.showLoader('Iniciando sesión...', 'Cargando configuraciones y permisos', 20);

    // Mount shell if not already mounted
    const appEl = document.getElementById('app');
    if (appEl && !document.getElementById('sidebarNav')) {
      appEl.innerHTML = SHELL_HTML;
      initModals();
    }

    // Load access control
    await accessControl.init(user);
    UI.showLoader('Iniciando sesión...', 'Preparando interfaz', 60);

    // Header info
    let names = user.displayName;
    if (!names && user.email) {
      names = user.email.split('@')[0];
    } else if (names && names.includes('@')) {
      names = names.split('@')[0];
    }
    if (!names) names = 'Usuario';

    // Capitalizar la primera letra para estética
    names = names.charAt(0).toUpperCase() + names.slice(1);

    document.getElementById('userNameLabel')!.textContent = names;
    document.getElementById('userRoleLabel')!.textContent = accessControl.state?.userType || 'Rol Desconocido';
    document.getElementById('userAvatar')!.textContent = names.charAt(0).toUpperCase();

    // Render sidebar depending on role
    await renderSidebar();

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      UI.dialog('Cerrar Sesión', '¿Estás seguro que deseas salir del sistema?', () => {
        signOut(auth);
      }, 'warning', 'Salir');
    });

    UI.showLoader('Iniciando sesión...', 'Cargando datos principales', 90);

    // Initial view
    if (accessControl.canView('view-kpi')) switchView('view-kpi');
    else if (accessControl.canView('view-cuaderno')) switchView('view-cuaderno');
    // Default fallback
    else {
      const firstAvailable = document.querySelector('.nav-item, .nav-subitem') as HTMLElement;
      if (firstAvailable?.dataset.view) switchView(firstAvailable.dataset.view);
    }

    // Hide loader
    setTimeout(() => {
      UI.hideLoader();
    }, 500);

  } catch (error) {
    console.error('Error init:', error);
    UI.toast('Error al cargar la plataforma', 'error');
    signOut(auth);
  }
});
