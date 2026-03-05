import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { accessControl } from '../access-control';
import { tsToDate, getUnidadesByCliente, getAllClientes, exportToExcel } from '../utils';
import { getLogoBase64, generateChartImage, exportToPDF } from '../pdf-utils';
import Choices from 'choices.js';
import { moment, $ } from '../globals';
import { UI } from '../ui';

import 'daterangepicker';

let drChoices: any = {};
let drData: any[] = [];
let usersMap: Record<string, string> = {};
let drFilters: any = { cliente: '', unidad: '', estado: '', fechaInicio: '', fechaFin: '' };
let lastVisibleDoc: any = null;
let allLoadedDocs: any[] = [];
let drCurrentPage = 1;
const ITEMS_PER_PAGE = 10;

export function initDetalleRondas(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;

    container.innerHTML = `
    <div class="card card-pad" style="margin-bottom:20px">
      <div class="filters-bar" style="align-items:stretch; flex-wrap:nowrap; gap:0;">
        <!-- Left: Filters -->
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;flex:1;">
          <div class="filter-group">
            <label class="filter-label">Cliente</label>
            <select id="kpiDetRonCliente"></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Unidad</label>
            <select id="kpiDetRonUnidad"></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Estado</label>
            <select id="kpiDetRonEstado">
              <option value="Todos">Todos</option>
              <option value="Completada">Completada</option>
              <option value="Incompleta">Incompleta</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Rango de Fecha</label>
            <input type="text" id="kpiDetRonFecha" placeholder="Seleccionar fechas">
          </div>
          <div style="display:flex; gap:10px; align-items:flex-end;">
            <button id="btnKPIDetRonBuscar" class="btn btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              Filtrar
            </button>
            <button id="btnKPIDetRonExcel" class="btn btn-success">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Excel
            </button>
            <button id="btnKPIDetRonPDF" class="btn btn-danger" style="background-color:#ef4444; border-color:#ef4444;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              PDF
            </button>
          </div>
        </div>
        <!-- Right: Stats counter inline -->
        <div style="display:flex;align-items:center;padding-left:24px;margin-left:auto;border-left:1px solid var(--border);">
          <div style="text-align:center;min-width:110px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:4px;">Rondas</div>
            <div id="kpiDRTotalNum" style="font-size:38px;font-weight:900;line-height:1;color:var(--accent);letter-spacing:-2px;">0</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">ENCONTRADAS</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Results Table -->
    <div class="card card-pad" style="overflow-x:auto">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Inicio</th>
                    <th>Término</th>
                    <th>Cliente</th>
                    <th>Unidad</th>
                    <th>Ronda</th>
                    <th>Usuario</th>
                    <th style="text-align:center">QR Reg.</th>
                    <th style="text-align:center">QR Sin Reg.</th>
                    <th style="text-align:center">Estado</th>
                    <th style="text-align:center">Acciones</th>
                </tr>
            </thead>
            <tbody id="detalle-rondas-tabla-body">
                <tr><td colspan="11" style="text-align:center;padding:40px">Sin resultados que mostrar</td></tr>
            </tbody>
        </table>
    </div>
    
    <div id="dr-pagination" style="padding-top:14px;"></div>
  `;


    // Show loader immediately so user gets feedback before async filter setup
    UI.showLoader('Preparando Detalle de Rondas...', 'Cargando filtros y datos...');

    setupFilters();

}

async function loadUsersMap() {
    if (Object.keys(usersMap).length > 0) return;
    try {
        const snap = await getDocs(collection(db, 'USUARIOS'));
        snap.forEach(doc => {
            const data = doc.data();
            const emailCode = doc.id.toLowerCase();
            usersMap[emailCode] = `${data.NOMBRES || ''} ${data.APELLIDOS || ''}`.trim() || data.nombre || 'Desconocido';
        });
    } catch (e) {
        console.error('Error loading users:', e);
    }
}

async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    drChoices.cliente = new Choices('#kpiDetRonCliente', cfg);
    drChoices.unidad = new Choices('#kpiDetRonUnidad', cfg);
    drChoices.estado = new Choices('#kpiDetRonEstado', cfg);

    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    drFilters.fechaInicio = start.toISOString().split('T')[0];
    drFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiDetRonFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Limpiar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'], monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] }
    });

    $('#kpiDetRonFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        drFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        drFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            drChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            drChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            drChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            drChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiDetRonCliente')?.addEventListener('change', async () => {
                const c = drChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    drChoices.unidad.clearChoices();
                    drChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPIDetRonBuscar')?.addEventListener('click', () => applyFiltersAndFetch(false));
        document.getElementById('btnKPIDetRonExcel')?.addEventListener('click', exportToExcelFile);
        document.getElementById('btnKPIDetRonPDF')?.addEventListener('click', exportToPDFReport);

        // Individual Ronda PDF listener
        document.getElementById('detalle-rondas-tabla-body')?.addEventListener('click', async (e) => {
            const btn = (e.target as HTMLElement).closest('.btn-download-ronda') as HTMLElement;
            if (btn) {
                const id = btn.dataset.id;
                if (id) await exportIndividualRondaPDF(id);
            }
        });
        await applyFiltersAndFetch(false);
    } catch (e) {
        console.error('Error in Detalle Rondas setup:', e);
        UI.hideLoader();
    }
}

async function loadUnidades(cliente: string) {
    drChoices.unidad.clearChoices();
    let unidades: string[] = [];
    if (cliente === 'Todos') {
        const clientes = await getAllClientes();
        for (const c of clientes) {
            const u = await getUnidadesByCliente(c);
            unidades = unidades.concat(u);
        }
    } else {
        unidades = await getUnidadesByCliente(cliente);
    }

    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        drChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        drChoices.unidad.setChoiceByValue(unidades[0]);
        drChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        drChoices.unidad.setChoices(arr, 'value', 'label', true);
        drChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch(isLoadMore = false) {
    const cliente = drChoices.cliente.getValue(true) || 'Todos';
    const unidad = drChoices.unidad.getValue(true) || 'Todas';
    const estado = drChoices.estado.getValue(true) || 'Todos';

    // Show overlay immediately — before any async work
    UI.showLoader(isLoadMore ? 'Cargando más...' : 'Consultando Rondas...', 'Buscando registros...');

    if (!isLoadMore) {
        drCurrentPage = 1;
        lastVisibleDoc = null;
        allLoadedDocs = [];
        const tbody = document.getElementById('detalle-rondas-tabla-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px">Consultando...</td></tr>';
    }

    drFilters.cliente = cliente === 'Todos' ? '' : cliente;
    drFilters.unidad = unidad === 'Todas' ? '' : unidad;
    drFilters.estado = estado === 'Todos' ? '' : estado;

    // Yield to browser so overlay paints before heavy async work begins
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    try {
        // Load users map in parallel with data fetch
        const usersPromise = loadUsersMap();

        // NOTE: No orderBy — legacy webantigua does not use orderBy.
        // Using orderBy('timestamp') excludes documents that only have horarioInicio,
        // resulting in far fewer records than expected. We sort client-side instead.
        let q = query(collection(db, 'RONDAS_COMPLETADAS'), limit(2000));

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            q = query(q, where('cliente', '==', accessControl.state.clienteAsignado));
        } else if (drFilters.cliente) {
            q = query(q, where('cliente', '==', drFilters.cliente));
        }

        if (drFilters.unidad) {
            q = query(q, where('unidad', '==', drFilters.unidad));
        }

        if (drFilters.estado && drFilters.estado !== 'Todos') {
            q = query(q, where('estado', '==', drFilters.estado === 'Completada' ? 'TERMINADA' : 'INCOMPLETA'));
        }

        // Run users map and data fetch concurrently
        const [snap] = await Promise.all([getDocs(q), usersPromise]);

        const parseDateSafe = (val: any): Date | null => {
            if (!val) return null;
            if (val.toDate && typeof val.toDate === 'function') return val.toDate();
            if (val instanceof Date) return val;
            if (val._seconds !== undefined) return new Date(val._seconds * 1000);
            if (val.seconds !== undefined) return new Date(val.seconds * 1000);
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        };

        let records = snap.docs.map(doc => {
            const data = doc.data();
            // Try both timestamp fields — some docs use horarioInicio, others use timestamp
            let dateObj = parseDateSafe(data.timestamp)
                || parseDateSafe(data.horarioInicio);
            return { id: doc.id, ...data, _dateObj: dateObj };
        });

        // Client-side date filtering (to match legacy behavior)
        if (drFilters.fechaInicio || drFilters.fechaFin) {
            const start = drFilters.fechaInicio ? new Date(drFilters.fechaInicio + 'T00:00:00') : null;
            const end = drFilters.fechaFin ? new Date(drFilters.fechaFin + 'T23:59:59') : null;
            records = records.filter(r => {
                if (!r._dateObj) return true; // include if no date to avoid hiding data
                if (start && r._dateObj < start) return false;
                if (end && r._dateObj > end) return false;
                return true;
            });
        }

        // Client-side sort: newest first
        records.sort((a, b) => {
            const tA = a._dateObj ? a._dateObj.getTime() : 0;
            const tB = b._dateObj ? b._dateObj.getTime() : 0;
            return tB - tA;
        });

        if (records.length === 0) {
            const tbody = document.getElementById('detalle-rondas-tabla-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px">Sin resultados</td></tr>';
            UI.toast('No se encontraron rondas', 'info');
            const pgEl = document.getElementById('dr-pagination'); if (pgEl) pgEl.innerHTML = '';
            const totalEl = document.getElementById('kpiDRTotalNum');
            if (totalEl) totalEl.textContent = '0';
            UI.hideLoader();
            return;
        }

        drData = records;
        allLoadedDocs = records;

        // Update counter before rendering
        const totalEl = document.getElementById('kpiDRTotalNum');
        if (totalEl) totalEl.textContent = drData.length.toLocaleString('es-PE');

        renderTable();

    } catch (e) {
        console.error('Error fetching Detalle Rondas:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function renderTable() {
    const tbody = document.getElementById('detalle-rondas-tabla-body');
    if (!tbody) return;

    if (drData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px">Sin resultados</td></tr>';
        const pg = document.getElementById('dr-pagination');
        if (pg) pg.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(drData.length / ITEMS_PER_PAGE);
    if (drCurrentPage > totalPages) drCurrentPage = totalPages;
    const start = (drCurrentPage - 1) * ITEMS_PER_PAGE;
    const pageData = drData.slice(start, start + ITEMS_PER_PAGE);

    let html = '';
    pageData.forEach((r: any) => {
        let fecha = '-';
        let hInicio = '-';
        let hFin = '-';

        if (r._dateObj) {
            fecha = r._dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            hInicio = r._dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        const dateFin = tsToDate(r.horarioTermino) || (r.horarioTermino ? new Date(r.horarioTermino) : null);
        if (dateFin && !isNaN(dateFin.getTime())) {
            hFin = dateFin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        let userName = '-';
        if (r.usuarioEmail || r.usuarioID || r.usuario) {
            const id = (r.usuarioID || r.usuario || r.usuarioEmail || '').split('@')[0].toLowerCase();
            userName = usersMap[id] || r.usuarioEmail || id;
        }

        let qrReg = 0, qrSin = 0;
        const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
        if (pArray.length > 0) {
            pArray.forEach((p: any) => { if (p.qrEscaneado === true) qrReg++; else qrSin++; });
        } else {
            qrReg = r.puntosCompletados || 0;
            qrSin = (r.puntosTotales || 0) - qrReg;
        }

        let color = '#94a3b8';
        let st = (r.estado || 'N/A').toUpperCase().replace('_', ' ');
        if (st === 'TERMINADA') color = '#22c55e';
        else if (st.includes('INCOMPLETA')) color = '#f59e0b';
        else if (st === 'NO REALIZADA') color = '#ef4444';
        else if (st === 'EN PROGRESO' || st === 'EN PROCESO') color = '#3b82f6';

        html += `<tr>
            <td>${fecha}</td>
            <td>${hInicio}</td>
            <td>${hFin}</td>
            <td>${r.cliente || '-'}</td>
            <td>${r.unidad || '-'}</td>
            <td>${r.nombre || '-'}</td>
            <td>${userName}</td>
            <td style="color:#22c55e;font-weight:bold;text-align:center">${qrReg}</td>
            <td style="color:#ef4444;font-weight:bold;text-align:center">${qrSin}</td>
            <td style="text-align:center"><span style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold">${st}</span></td>
            <td style="text-align:center">
                <button class="btn-download-ronda" data-id="${r.id}" title="Descargar PDF" style="background:none; border:none; color:var(--accent); cursor:pointer; padding:4px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderDRPagination(totalPages);
}

function renderDRPagination(totalPages: number) {
    const container = document.getElementById('dr-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const rangeStart = (drCurrentPage - 1) * ITEMS_PER_PAGE + 1;
    const rangeEnd = Math.min(drCurrentPage * ITEMS_PER_PAGE, drData.length);

    let pages: (number | string)[] = [];
    if (totalPages <= 7) {
        pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
        pages = [1];
        if (drCurrentPage > 3) pages.push('...');
        const lo = Math.max(2, drCurrentPage - 1);
        const hi = Math.min(totalPages - 1, drCurrentPage + 1);
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (drCurrentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    const btnS = (active: boolean, dis = false) =>
        `style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};background:${active ? 'var(--accent)' : 'transparent'};color:${active ? '#fff' : dis ? 'rgba(255,255,255,0.25)' : '#cbd5e1'};font-size:12px;font-weight:${active ? '700' : '500'};cursor:${dis ? 'default' : 'pointer'};"`

    let html = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:4px 0;">
      <span style="font-size:12px;color:var(--text-muted)">Mostrando <strong style="color:var(--text)">${rangeStart}&ndash;${rangeEnd}</strong> de <strong style="color:var(--text)">${drData.length}</strong> registros</span>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        <button id="dr-pg-prev" ${btnS(false, drCurrentPage === 1)} ${drCurrentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;

    pages.forEach((p: any) => {
        if (p === '...') {
            html += `<span style="color:var(--text-muted);padding:0 3px;font-size:13px;">&#8230;</span>`;
        } else {
            html += `<button class="dr-pg-num" data-page="${p}" ${btnS(p === drCurrentPage, false)}>${p}</button>`;
        }
    });

    html += `<button id="dr-pg-next" ${btnS(false, drCurrentPage === totalPages)} ${drCurrentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>
      </div></div>`;

    container.innerHTML = html;

    document.getElementById('dr-pg-prev')?.addEventListener('click', () => {
        if (drCurrentPage > 1) { drCurrentPage--; renderTable(); }
    });
    document.getElementById('dr-pg-next')?.addEventListener('click', () => {
        if (drCurrentPage < totalPages) { drCurrentPage++; renderTable(); }
    });
    container.querySelectorAll('.dr-pg-num').forEach((b: any) => {
        b.addEventListener('click', () => {
            drCurrentPage = parseInt(b.dataset.page || '1');
            renderTable();
        });
    });
}
async function exportToExcelFile() {
    if (!drData.length) {
        alert('No hay datos para exportar.');
        return;
    }
    const data = drData.map(r => {
        let fecha = '-', hIni = '-', hFin = '-';
        if (r._dateObj) {
            fecha = r._dateObj.toLocaleDateString('es-PE');
            hIni = r.horarioRonda || r._dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        const dFin = tsToDate(r.horarioTermino);
        if (dFin) hFin = dFin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

        let user = r.usuarioEmail || '-';
        if (r.usuarioEmail) {
            const code = r.usuarioEmail.split('@')[0].toLowerCase();
            user = usersMap[code] || r.usuarioEmail;
        }

        let qrReg = 0, qrSin = 0;
        const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
        if (pArray.length > 0) {
            pArray.forEach((p: any) => { if (p.qrEscaneado) qrReg++; else qrSin++; });
        } else {
            qrReg = r.puntosCompletados || 0;
            qrSin = (r.puntosTotales || 0) - qrReg;
        }

        return {
            'FECHA': fecha,
            'HORA INICIO': hIni,
            'HORA TÉRMINO': hFin,
            'CLIENTE': r.cliente || '-',
            'UNIDAD': r.unidad || '-',
            'RONDA': r.nombre || '-',
            'USUARIO': user,
            'QR REG': qrReg,
            'QR SIN REG': qrSin,
            'ESTADO': r.estado || 'N/A'
        };
    });

    await exportToExcel(data, `DetalleRondas_${new Date().toISOString().split('T')[0]}`,
        ['FECHA', 'HORA INICIO', 'HORA TÉRMINO', 'CLIENTE', 'UNIDAD', 'RONDA', 'USUARIO', 'QR REG', 'QR SIN REG', 'ESTADO']
    );
}

async function exportToPDFReport() {
    if (!drData.length) {
        UI.toast('No hay datos para exportar', 'warning');
        return;
    }

    UI.showLoader('Generando PDF...', 'Preparando reporte de Detalle de Rondas');

    try {
        const logo = await getLogoBase64();
        let registrados = 0;
        let noRegistrados = 0;

        const tableData = drData.map(r => {
            let fecha = '-';
            let hInicio = '-';
            let hFin = '-';

            if (r._dateObj) {
                fecha = r._dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                hInicio = r._dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            const dateFin = tsToDate(r.horarioTermino) || (r.horarioTermino ? new Date(r.horarioTermino) : null);
            if (dateFin && !isNaN(dateFin.getTime())) {
                hFin = dateFin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            let userName = '-';
            if (r.usuarioEmail || r.usuarioID || r.usuario) {
                const id = (r.usuarioID || r.usuario || r.usuarioEmail || '').split('@')[0].toLowerCase();
                userName = usersMap[id] || r.usuarioEmail || id;
            }

            let qrReg = 0, qrSin = 0;
            const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
            if (pArray.length > 0) {
                pArray.forEach((p: any) => { if (p.qrEscaneado === true) qrReg++; else qrSin++; });
            } else {
                qrReg = r.puntosCompletados || 0;
                qrSin = (r.puntosTotales || 0) - qrReg;
            }

            registrados += qrReg;
            noRegistrados += qrSin;

            return [
                fecha, hInicio, hFin, r.cliente || '-', r.unidad || '-', r.nombre || '-', userName, qrReg.toString(), qrSin.toString(), (r.estado || 'N/A').toUpperCase().replace('_', ' ')
            ];
        });

        const totalPuntos = registrados + noRegistrados;
        const porcentajeReg = totalPuntos > 0 ? ((registrados / totalPuntos) * 100).toFixed(1) : '0';
        const porcentajeNoReg = totalPuntos > 0 ? ((noRegistrados / totalPuntos) * 100).toFixed(1) : '0';

        const chartImage = await generateChartImage(
            [`Registrados\n${registrados}\n(${porcentajeReg}%)`, `No Registrados\n${noRegistrados}\n(${porcentajeNoReg}%)`],
            [registrados, noRegistrados],
            ['#10b981', '#ef4444']
        );

        const docDef: any = {
            pageSize: 'A4',
            pageMargins: [40, 70, 40, 40],
            header: function (currentPage: number) {
                if (currentPage === 1) {
                    return {
                        columns: [
                            logo ? { image: logo, width: 60, height: 60 } : { text: '' },
                            {
                                text: 'REPORTE DE DETALLE DE RONDAS',
                                fontSize: 18,
                                bold: true,
                                alignment: 'center',
                                margin: [0, 20, 0, 0],
                                color: '#1565C0'
                            },
                            { text: '', width: 60 }
                        ],
                        margin: [40, 10, 40, 0]
                    };
                }
            },
            footer: function (currentPage: number, pageCount: number) {
                return {
                    text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
                    alignment: 'center',
                    fontSize: 9,
                    margin: [0, 0, 0, 20],
                    color: '#999'
                };
            },
            content: [
                {
                    text: `Resumen de Puntos de Control`,
                    fontSize: 14,
                    bold: true,
                    margin: [0, 10, 0, 15],
                    color: '#1565C0'
                },
                {
                    columns: [
                        {
                            width: '45%',
                            stack: [
                                {
                                    text: 'ESTADÍSTICAS',
                                    fontSize: 12,
                                    bold: true,
                                    margin: [0, 0, 0, 10],
                                    color: '#333'
                                },
                                {
                                    table: {
                                        widths: ['60%', '40%'],
                                        body: [
                                            [
                                                { text: 'Total de Puntos:', bold: true, color: '#333', fontSize: 11 },
                                                { text: totalPuntos.toString(), bold: true, color: '#1565C0', fontSize: 14, alignment: 'center' }
                                            ],
                                            [
                                                { text: 'Registrados:', color: '#059669', bold: true, fontSize: 11 },
                                                { text: `${registrados} (${porcentajeReg}%)`, color: '#059669', bold: true, fontSize: 12, alignment: 'center' }
                                            ],
                                            [
                                                { text: 'No Registrados:', color: '#dc2626', bold: true, fontSize: 11 },
                                                { text: `${noRegistrados} (${porcentajeNoReg}%)`, color: '#dc2626', bold: true, fontSize: 12, alignment: 'center' }
                                            ]
                                        ]
                                    }
                                }
                            ]
                        },
                        {
                            width: 250,
                            alignment: 'center',
                            image: chartImage,
                            height: 180
                        }
                    ],
                    margin: [0, 0, 0, 30],
                    columnGap: 20
                },
                {
                    text: 'DETALLE DE RONDAS',
                    fontSize: 12,
                    bold: true,
                    margin: [0, 20, 0, 10],
                    color: '#1565C0'
                },
                {
                    table: {
                        headerRows: 1,
                        widths: ['9%', '8%', '8%', '9%', '9%', '12%', '14%', '8%', '8%', '15%'],
                        body: [
                            [
                                { text: 'FECHA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'H.INI', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'H.TER', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'CLIENTE', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'UNIDAD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'RONDA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'USUARIO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'REG', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'NO REG', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'ESTADO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 }
                            ],
                            ...tableData.map(fila => fila.map((cell, idx) => ({
                                text: cell,
                                fontSize: 8,
                                alignment: 'center',
                                bold: idx === 6 || idx === 7 || idx === 8,
                                color: idx === 7 ? '#059669' : (idx === 8 ? '#dc2626' : '#333')
                            })))
                        ]
                    },
                    layout: {
                        hLineWidth: () => 0.5,
                        vLineWidth: () => 0.5,
                        hLineColor: () => '#d0d0d0',
                        vLineColor: () => '#d0d0d0',
                        paddingLeft: () => 4,
                        paddingRight: () => 4,
                        paddingTop: () => 5,
                        paddingBottom: () => 5,
                        fillColor: (i: number) => (i === 0 ? '#1565C0' : (i % 2 === 0 ? '#f9f9f9' : null))
                    }
                }
            ]
        };

        await exportToPDF(docDef, `ReporteDetalleRondas_${Date.now()}.pdf`);
        UI.toast('PDF generado correctamente', 'success');
    } catch (e: any) {
        console.error('Error generating PDF:', e);
        UI.toast('Error al generar PDF: ' + e.message, 'error');
    } finally {
        UI.hideLoader();
    }
}

async function exportIndividualRondaPDF(rondaId: string) {
    const r = drData.find(x => x.id === rondaId);
    if (!r) {
        UI.toast('No se encontró la data de la ronda', 'error');
        return;
    }

    UI.showLoader('Generando PDF de Ronda...', 'Cargando detalles de la ronda');

    try {
        const logo = await getLogoBase64();

        let fecha = '-';
        let hInicio = '-';
        let hFin = '-';

        if (r._dateObj) {
            fecha = r._dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            hInicio = r._dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        const dateFin = tsToDate(r.horarioTermino) || (r.horarioTermino ? new Date(r.horarioTermino) : null);
        if (dateFin && !isNaN(dateFin.getTime())) {
            hFin = dateFin.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        let qrReg = 0, qrSin = 0;
        const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
        const detailedPuntos: any[] = [];

        pArray.forEach((p: any, idx: number) => {
            const registrado = p.qrEscaneado === true;
            if (registrado) qrReg++; else qrSin++;

            let ts = p.horaEscaneo;
            if (!ts && p.respuestas) {
                ts = p.respuestas.timestamp || p.respuestas.fecha;
            }
            if (!ts && p.timestamp) {
                ts = p.timestamp;
            }

            let horaEscaneo = '-';
            if (ts) {
                const d = tsToDate(ts);
                if (d) horaEscaneo = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
            }

            detailedPuntos.push([
                (idx + 1).toString(),
                p.nombre || `Punto ${idx + 1}`,
                registrado ? '✓ Registrado' : '✗ No Registrado',
                horaEscaneo
            ]);
        });

        if (pArray.length === 0) {
            qrReg = r.puntosCompletados || 0;
            qrSin = (r.puntosTotales || 0) - qrReg;
        }

        const totalPuntos = qrReg + qrSin;
        const porcentajeReg = totalPuntos > 0 ? ((qrReg / totalPuntos) * 100).toFixed(1) : '0';
        const porcentajeNoReg = totalPuntos > 0 ? ((qrSin / totalPuntos) * 100).toFixed(1) : '0';

        const chartImage = await generateChartImage(
            [`Registrados\n${qrReg}\n(${porcentajeReg}%)`, `No Registrados\n${qrSin}\n(${porcentajeNoReg}%)`],
            [qrReg, qrSin],
            ['#10b981', '#ef4444']
        );

        const docDef: any = {
            pageSize: 'A4',
            pageMargins: [40, 70, 40, 40],
            header: function (currentPage: number) {
                if (currentPage === 1) {
                    return {
                        columns: [
                            logo ? { image: logo, width: 60, height: 60 } : { text: '' },
                            {
                                text: 'REPORTE INDIVIDUAL DE RONDA',
                                fontSize: 18,
                                bold: true,
                                alignment: 'center',
                                margin: [0, 20, 0, 0],
                                color: '#1565C0'
                            },
                            { text: '', width: 60 }
                        ],
                        margin: [40, 10, 40, 0]
                    };
                }
            },
            footer: function (currentPage: number, pageCount: number) {
                return {
                    text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
                    alignment: 'center',
                    fontSize: 9,
                    margin: [0, 0, 0, 20],
                    color: '#999'
                };
            },
            content: [
                {
                    text: 'INFORMACIÓN DE LA RONDA',
                    style: 'subheader',
                    color: '#1565C0',
                    margin: [0, 10, 0, 10],
                    bold: true,
                    fontSize: 14
                },
                {
                    columns: [
                        {
                            width: '50%',
                            stack: [
                                { text: `Cliente: ${r.cliente || '-'}`, margin: [0, 2, 0, 2] },
                                { text: `Unidad: ${r.unidad || '-'}`, margin: [0, 2, 0, 2] },
                                { text: `Nombre Ronda: ${r.nombre || '-'}`, margin: [0, 2, 0, 2] }
                            ]
                        },
                        {
                            width: '50%',
                            stack: [
                                { text: `Fecha: ${fecha}`, margin: [0, 2, 0, 2] },
                                { text: `Hora Inicio: ${hInicio}`, margin: [0, 2, 0, 2] },
                                { text: `Hora Término: ${hFin}`, margin: [0, 2, 0, 2] },
                                { text: `Estado: ${(r.estado || 'N/A').toUpperCase()}`, bold: true, margin: [0, 2, 0, 2] }
                            ]
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },
                {
                    columns: [
                        {
                            width: '45%',
                            stack: [
                                { text: 'ESTADÍSTICAS DE PUNTOS', bold: true, margin: [0, 0, 0, 5] },
                                {
                                    table: {
                                        widths: ['70%', '30%'],
                                        body: [
                                            ['Total Puntos:', { text: totalPuntos.toString(), bold: true, alignment: 'center' }],
                                            [{ text: 'Registrados:', color: '#059669' }, { text: qrReg.toString(), color: '#059669', bold: true, alignment: 'center' }],
                                            [{ text: 'No Registrados:', color: '#dc2626' }, { text: qrSin.toString(), color: '#dc2626', bold: true, alignment: 'center' }]
                                        ]
                                    }
                                }
                            ]
                        },
                        {
                            width: 220,
                            alignment: 'center',
                            image: chartImage,
                            height: 160
                        }
                    ],
                    margin: [0, 0, 0, 20]
                }
            ]
        };

        if (detailedPuntos.length > 0) {
            docDef.content.push(
                { text: 'DETALLE DE PUNTOS ESCANEADOS', bold: true, margin: [0, 20, 0, 10], color: '#1565C0' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['10%', '50%', '20%', '20%'],
                        body: [
                            [
                                { text: 'N°', bold: true, fillColor: '#1565C0', color: 'white' },
                                { text: 'PUNTO', bold: true, fillColor: '#1565C0', color: 'white' },
                                { text: 'ESTADO', bold: true, fillColor: '#1565C0', color: 'white' },
                                { text: 'HORA', bold: true, fillColor: '#1565C0', color: 'white' }
                            ],
                            ...detailedPuntos.map(p => [
                                { text: p[0], alignment: 'center' },
                                { text: p[1] },
                                { text: p[2], color: p[2].includes('✓') ? '#059669' : '#dc2626', bold: true, alignment: 'center' },
                                { text: p[3], alignment: 'center' }
                            ])
                        ]
                    },
                    layout: 'lightHorizontalLines'
                }
            );
        }

        await exportToPDF(docDef, `Ronda_${r.cliente || 'Lider'}_${fecha.replace(/\//g, '-')}.pdf`);
        UI.toast('PDF de Ronda generado', 'success');
    } catch (e: any) {
        console.error('Error individual PDF:', e);
        UI.toast('Error: ' + e.message, 'error');
    } finally {
        UI.hideLoader();
    }
}

