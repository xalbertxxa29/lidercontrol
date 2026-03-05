// Import sub-tabs
import { initResumen } from '../kpi/Resumen';
import { initDetalleIncidentes } from '../kpi/DetalleIncidentes';
import { initRondaGeneral } from '../kpi/RondaGeneral';
import { initDetalleRondas } from '../kpi/DetalleRondas';
import { initAccesoPeatonal } from '../kpi/AccesoPeatonal';
import { initDetalleAcceso } from '../kpi/DetalleAcceso';
import { initControlVehicular } from '../kpi/ControlVehicular';
import { initRondasManuales } from '../kpi/RondasManuales';
import { initIncidenciasHM } from '../kpi/IncidenciasHM';

const KPI_TABS = [
    { id: 'kpi-resumen', label: 'Resumen', module: initResumen },
    { id: 'kpi-detalle-inc', label: 'Detalle de Incidentes', module: initDetalleIncidentes },
    { id: 'kpi-ronda-gen', label: 'Ronda General', module: initRondaGeneral },
    { id: 'kpi-detalle-ron', label: 'Detalle de Rondas', module: initDetalleRondas },
    { id: 'kpi-acceso-pea', label: 'Acceso Peatonal', module: initAccesoPeatonal },
    { id: 'kpi-detalle-acc', label: 'Detalle Acceso', module: initDetalleAcceso },
    { id: 'kpi-control-veh', label: 'Control Vehicular', module: initControlVehicular },
    { id: 'kpi-rondas-man', label: 'Rondas Manuales', module: initRondasManuales },
    { id: 'kpi-hym', label: 'Incidencias H&M', module: initIncidenciasHM }
];

let isInitialized = false;
let currentTab = '';

export function initKPIView() {
    if (isInitialized) return;
    const container = document.getElementById('view-kpi');
    if (!container) return;

    // Render Subnav
    let html = `<div class="kpi-subnav">`;
    KPI_TABS.forEach((t, i) => {
        html += `<button class="kpi-tab ${i === 0 ? 'active' : ''}" data-target="${t.id}">${t.label}</button>`;
    });
    html += `</div>
  <div class="kpi-content" id="kpiContent">`;

    KPI_TABS.forEach((t, i) => {
        html += `<div class="kpi-subview ${i === 0 ? 'active' : ''}" id="${t.id}"></div>`;
    });
    html += `</div>`;

    container.innerHTML = html;

    // Bind clicks
    container.querySelectorAll('.kpi-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = (e.currentTarget as HTMLElement).dataset.target;
            if (target) switchTab(target);
        });
    });

    isInitialized = true;
    switchTab(KPI_TABS[0].id); // Load first tab
}

function switchTab(tabId: string) {
    if (currentTab === tabId) return;
    currentTab = tabId;

    // UI switch
    document.querySelectorAll('.kpi-tab.active, .kpi-subview.active').forEach(e => e.classList.remove('active'));
    document.querySelector(`.kpi-tab[data-target="${tabId}"]`)?.classList.add('active');
    const el = document.getElementById(tabId);
    if (el) el.classList.add('active');

    // Trigger initialization only if not already initialized
    if (el && !el.innerHTML.trim()) {
        const tabDef = KPI_TABS.find(t => t.id === tabId);
        if (tabDef && tabDef.module && typeof tabDef.module === 'function') {
            (tabDef.module as Function)(tabId);
        } else {
            // Placeholder while developing remaining tabs
            el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚧</div>
          <div class="empty-title">En construcción</div>
          <div class="empty-sub">El módulo "${tabDef?.label}" se está migrando.</div>
        </div>
      `;
        }
    }
}
