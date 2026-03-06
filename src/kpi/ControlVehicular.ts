import { db } from '../firebase';
import { collection, query, where, getDocs, limit, startAfter } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import { getUnidadesByCliente, getAllClientes, exportToExcel, tsToDate } from '../utils';
import { getLogoBase64, generateChartImage, exportToPDF } from '../pdf-utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';

import 'daterangepicker';

let cvChoices: any = {};
let cvCharts: Record<string, Chart> = {};
let cvData: any[] = [];
let lastVisibleDoc: any = null;
let allLoadedDocs: any[] = [];
const PAGE_SIZE = 5000;
let cvCurrentPage = 1;
const ITEMS_PER_PAGE = 10;
let cvFilters = {
    cliente: '',
    unidad: '',
    estado: '',
    fechaInicio: '',
    fechaFin: ''
};

export function initControlVehicular(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;
    if (container.innerHTML.trim() !== '') return;

    container.innerHTML = `
    <!-- Filtros -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group"><label class="filter-label">Fecha / Rango</label><input type="text" id="kpiCVFecha" class="search-input" /></div>
        <div class="filter-group"><label class="filter-label">Cliente</label><select id="kpiCVCliente"><option value="Todos">Todos</option></select></div>
        <div class="filter-group"><label class="filter-label">Unidad</label><select id="kpiCVUnidad"><option value="Todas">Todas</option></select></div>
        <div class="filter-group"><label class="filter-label">Estado</label><select id="kpiCVEstado">
            <option value="Todos">Todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="salida">Salida</option>
        </select></div>
        <div class="filter-group" style="padding-bottom:2px"><button class="btn btn-primary" id="btnKPICVBuscar">Aplicar</button></div>
        <div class="filter-group" style="padding-bottom:2px; margin-left:auto; display:flex; gap:8px">
          <button class="btn btn-success" id="btnKPICVExcel">Excel Data</button>
          <button class="btn btn-danger" id="btnKPICVPDF" style="background-color:#ef4444; border-color:#ef4444;">PDF</button>
        </div>
      </div>
    </div>

    <!-- Counters -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="ap-stats-row" style="display:flex; justify-content:space-around; text-align:center">
        <div class="ap-stat"><div class="ap-stat-num" id="statCVTotal" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Total Gral</div></div>
        <div class="ap-stat" style="color:var(--info)"><div class="ap-stat-num" id="statCVIngreso" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Ingresados</div></div>
        <div class="ap-stat" style="color:var(--warning)"><div class="ap-stat-num" id="statCVPendiente" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Pendientes</div></div>
        <div class="ap-stat" style="color:var(--success)"><div class="ap-stat-num" id="statCVSalida" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Salidas</div></div>
      </div>
    </div>

    <!-- Charts -->
    <div class="dashboard-grid grid-3" style="margin-bottom:16px">
      <div class="card chart-card col-span-2"><h4 class="card-title">Acceso Vehicular por Fechas</h4><div class="chart-wrap" style="height:250px"><canvas id="chartCVFecha"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Reporte por Estado</h4><div class="chart-wrap" style="height:250px"><canvas id="chartCVEstado"></canvas></div></div>
    </div>

    <!-- Table -->
    <div class="card card-pad">
      <div class="table-wrap">
        <table id="tableCV" class="data-table">
          <thead>
            <tr>
              <th>FH Ing</th>
              <th>FH Sal</th>
              <th>Placa</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Usuario Ing</th>
              <th>Estado</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody id="cv-tbody">
            <tr><td colspan="8" style="text-align:center;padding:30px">Sin resultados</td></tr>
          </tbody>
        </table>
      </div>
      <div id="cv-pagination" style="padding-top:14px;"></div>
    </div>
  `;

    setupFilters();
}

async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    cvChoices.cliente = new Choices('#kpiCVCliente', cfg);
    cvChoices.unidad = new Choices('#kpiCVUnidad', cfg);
    cvChoices.estado = new Choices('#kpiCVEstado', cfg);

    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    cvFilters.fechaInicio = start.toISOString().split('T')[0];
    cvFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiCVFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], firstDay: 1 }
    });

    $('#kpiCVFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        cvFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        cvFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            cvChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            cvChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            cvChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            cvChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiCVCliente')?.addEventListener('change', async () => {
                const c = cvChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    cvChoices.unidad.clearChoices();
                    cvChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPICVBuscar')?.addEventListener('click', applyFiltersAndFetch);
        document.getElementById('btnKPICVExcel')?.addEventListener('click', exportToExcelFile);
        document.getElementById('btnKPICVPDF')?.addEventListener('click', exportToPDFReport);
        setTimeout(applyFiltersAndFetch, 500);
    } catch (e) {
        console.error('Error in CV setup:', e);
    }
}

async function loadUnidades(cliente: string) {
    cvChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        cvChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        cvChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        cvChoices.unidad.setChoiceByValue(unidades[0]);
        cvChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        cvChoices.unidad.setChoices(arr, 'value', 'label', true);
        cvChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch() {
    const cliente = cvChoices.cliente.getValue(true) || 'Todos';
    const unidad = cvChoices.unidad.getValue(true) || 'Todas';
    const estado = cvChoices.estado.getValue(true) || 'Todos';

    cvCurrentPage = 1;
    lastVisibleDoc = null;
    allLoadedDocs = [];
    const tbody = document.getElementById('cv-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">Cargando...</td></tr>';

    UI.showLoader('Filtrando accesos...', 'Consultando base de datos', 20);
    cvFilters.cliente = cliente === 'Todos' ? '' : cliente;
    cvFilters.unidad = unidad === 'Todas' ? '' : unidad;
    cvFilters.estado = estado === 'Todos' ? '' : estado;

    try {
        let q = query(collection(db, 'ACCESO_VEHICULAR'), limit(PAGE_SIZE));

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            q = query(q, where('cliente', '==', accessControl.state.clienteAsignado));
        } else if (cvFilters.cliente) {
            q = query(q, where('cliente', '==', cvFilters.cliente));
        }

        if (cvFilters.unidad) {
            q = query(q, where('unidad', '==', cvFilters.unidad));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            UI.toast('No se encontraron registros', 'info');
            cvData = [];
            renderStats();
            drawCharts();
            renderTable();
            UI.hideLoader();
            return;
        }

        const newRecords = snapshot.docs.map(doc => {
            const data = doc.data();
            const ts = tsToDate(data.timestamp);
            return { id: doc.id, ...data, _ts: ts };
        });

        newRecords.forEach(r => allLoadedDocs.push(r));

        let filtered = allLoadedDocs;
        if (cvFilters.fechaInicio || cvFilters.fechaFin) {
            const startStr = cvFilters.fechaInicio;
            const endStr = cvFilters.fechaFin;
            filtered = filtered.filter(r => {
                if (!r._ts) return false;
                const dStr = r._ts.toISOString().split('T')[0];
                if (startStr && dStr < startStr) return false;
                if (endStr && dStr > endStr) return false;
                return true;
            });
        }

        if (cvFilters.estado && cvFilters.estado !== 'Todos') {
            filtered = filtered.filter(r => (r.estado || '').toString().toUpperCase() === cvFilters.estado.toUpperCase());
        }

        filtered.sort((a, b) => (b._ts || 0) - (a._ts || 0));

        cvData = filtered;
        renderStats();
        drawCharts();
        renderTable();

        const totalEl = document.getElementById('statCVTotal'); // Assuming statCVTotal is the intended element
        if (totalEl) totalEl.textContent = cvData.length.toLocaleString('es-PE');

    } catch (e) {
        console.error('Error in CV fetch:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function renderStats() {
    const total = cvData.length;
    const ing = cvData.filter(r => r.estado === 'ingreso').length;
    const sal = cvData.filter(r => r.estado === 'salida').length;
    const pend = cvData.filter(r => r.estado === 'ingreso').length;

    const elTotal = document.getElementById('statCVTotal');
    const elIng = document.getElementById('statCVIngreso');
    const elPend = document.getElementById('statCVPendiente');
    const elSal = document.getElementById('statCVSalida');

    if (elTotal) elTotal.textContent = total.toLocaleString('es-PE');
    if (elIng) elIng.textContent = total.toLocaleString('es-PE');
    if (elPend) elPend.textContent = pend.toLocaleString('es-PE');
    if (elSal) elSal.textContent = sal.toLocaleString('es-PE');
}

function drawCharts() {
    drawFechaChart();
    drawEstadoChart();
}

function drawFechaChart() {
    const ctx = document.getElementById('chartCVFecha') as HTMLCanvasElement;
    if (!ctx) return;
    if (cvCharts.fecha) cvCharts.fecha.destroy();

    const fechasMap: Record<string, number> = {};
    cvData.forEach(r => {
        if (!r._ts) return;
        const k = r._ts.toISOString().split('T')[0];
        fechasMap[k] = (fechasMap[k] || 0) + 1;
    });

    const sorted = Object.keys(fechasMap).sort();
    cvCharts.fecha = new Chart(ctx, {
        type: 'line',
        data: { labels: sorted, datasets: [{ label: 'Accesos', data: sorted.map(k => fechasMap[k]), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
}

function drawEstadoChart() {
    const ctx = document.getElementById('chartCVEstado') as HTMLCanvasElement;
    if (!ctx) return;
    if (cvCharts.estado) cvCharts.estado.destroy();

    const counts: Record<string, number> = {};
    cvData.forEach(r => { const st = r.estado || 'S/E'; counts[st] = (counts[st] || 0) + 1; });

    cvCharts.estado = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#10b981', '#3b82f6', '#94a3b8'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
}

function renderTable() {
    const tbody = document.getElementById('cv-tbody');
    if (!tbody) return;

    if (cvData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">Sin resultados</td></tr>';
        const pg = document.getElementById('cv-pagination'); if (pg) pg.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(cvData.length / ITEMS_PER_PAGE);
    if (cvCurrentPage > totalPages) cvCurrentPage = totalPages;
    const start = (cvCurrentPage - 1) * ITEMS_PER_PAGE;
    const pageData = cvData.slice(start, start + ITEMS_PER_PAGE);

    let html = '';
    pageData.forEach(r => {
        const fhIng = tsToDate(r.fechaIngreso)?.toLocaleString('es-PE') || '-';
        const fhSal = tsToDate(r.fechaSalida)?.toLocaleString('es-PE') || '-';

        let stColor = '#94a3b8';
        const st = (r.estado || '').toString();
        if (st === 'ingreso') stColor = '#10b981';
        else if (st === 'salida') stColor = '#3b82f6';

        let imgHtml = '<span style="color:#94a3b8;font-size:11px">Sin foto</span>';
        if (r.fotoURL) {
            imgHtml = `<img src="${r.fotoURL}" style="width:40px;height:40px;border-radius:4px;object-fit:cover;cursor:pointer" />`;
        }

        html += `<tr>
            <td>${fhIng}</td>
            <td>${fhSal}</td>
            <td>${r.placa || '-'}</td>
            <td>${r.cliente || '-'}</td>
            <td>${r.unidad || '-'}</td>
            <td>${r.usuario || '-'}</td>
            <td style="text-align:center"><span style="background:${stColor}20;color:${stColor};padding:4px 12px;border-radius:12px;font-size:11px;font-weight:bold">${st}</span></td>
            <td style="text-align:center">${imgHtml}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderCVPagination(totalPages);
}

function renderCVPagination(totalPages: number) {
    const container = document.getElementById('cv-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const rangeStart = (cvCurrentPage - 1) * ITEMS_PER_PAGE + 1;
    const rangeEnd = Math.min(cvCurrentPage * ITEMS_PER_PAGE, cvData.length);

    let pages: (number | string)[] = [];
    if (totalPages <= 7) {
        pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
        pages = [1];
        if (cvCurrentPage > 3) pages.push('...');
        const lo = Math.max(2, cvCurrentPage - 1);
        const hi = Math.min(totalPages - 1, cvCurrentPage + 1);
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (cvCurrentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    const btnS = (active: boolean, dis = false) =>
        `style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};background:${active ? 'var(--accent)' : 'transparent'};color:${active ? '#fff' : dis ? 'rgba(255,255,255,0.25)' : '#cbd5e1'};font-size:12px;font-weight:${active ? '700' : '500'};cursor:${dis ? 'default' : 'pointer'};"`

    let html = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:4px 0;">
      <span style="font-size:12px;color:var(--text-muted)">Mostrando <strong style="color:var(--text)">${rangeStart}&ndash;${rangeEnd}</strong> de <strong style="color:var(--text)">${cvData.length}</strong> registros</span>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        <button id="cv-pg-prev" ${btnS(false, cvCurrentPage === 1)} ${cvCurrentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;

    pages.forEach((p: any) => {
        if (p === '...') {
            html += `<span style="color:var(--text-muted);padding:0 3px;font-size:13px;">&#8230;</span>`;
        } else {
            html += `<button class="cv-pg-num" data-page="${p}" ${btnS(p === cvCurrentPage, false)}>${p}</button>`;
        }
    });

    html += `<button id="cv-pg-next" ${btnS(false, cvCurrentPage === totalPages)} ${cvCurrentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>
      </div></div>`;

    container.innerHTML = html;

    document.getElementById('cv-pg-prev')?.addEventListener('click', () => {
        if (cvCurrentPage > 1) { cvCurrentPage--; renderTable(); }
    });
    document.getElementById('cv-pg-next')?.addEventListener('click', () => {
        if (cvCurrentPage < totalPages) { cvCurrentPage++; renderTable(); }
    });
    container.querySelectorAll('.cv-pg-num').forEach((b: any) => {
        b.addEventListener('click', () => {
            cvCurrentPage = parseInt(b.dataset.page || '1');
            renderTable();
        });
    });
}

async function exportToExcelFile() {
    if (!cvData.length) {
        alert('No hay datos para exportar.');
        return;
    }
    const data = cvData.map(r => ({
        'FH INGRESO': tsToDate(r.fechaIngreso)?.toLocaleString('es-PE') || '-',
        'FH SALIDA': tsToDate(r.fechaSalida)?.toLocaleString('es-PE') || '-',
        'PLACA': r.placa || '-',
        'CLIENTE': r.cliente || '-',
        'UNIDAD': r.unidad || '-',
        'USUARIO': r.usuario || '-',
        'ESTADO': r.estado || '-',
        'OBSERVACIONES': r.observaciones || '-'
    }));

    await exportToExcel(data, `ControlVehicular_${new Date().toISOString().split('T')[0]}`,
        ['FH INGRESO', 'FH SALIDA', 'PLACA', 'CLIENTE', 'UNIDAD', 'USUARIO', 'ESTADO', 'OBSERVACIONES']
    );
}

async function exportToPDFReport() {
    if (!cvData.length) {
        UI.toast('No hay datos para exportar', 'warning');
        return;
    }

    UI.showLoader('Generando PDF...', 'Preparando reporte de Control Vehicular');

    try {
        const logo = await getLogoBase64();

        const ing = cvData.filter(r => r.estado === 'ingreso').length;
        const sal = cvData.filter(r => r.estado === 'salida').length;
        const total = cvData.length;

        const chartImage = await generateChartImage(
            [`Ingresos: ${ing}`, `Salidas: ${sal}`],
            [ing, sal],
            ['#10b981', '#3b82f6']
        );

        const tableData = cvData.map(r => [
            tsToDate(r.fechaIngreso)?.toLocaleString('es-PE') || '-',
            tsToDate(r.fechaSalida)?.toLocaleString('es-PE') || '-',
            r.placa || '-',
            r.cliente || '-',
            r.unidad || '-',
            r.usuario || '-',
            (r.estado || '-').toUpperCase(),
            (r.observaciones || '-')
        ]);

        const docDef: any = {
            pageSize: 'A4',
            pageOrientation: 'landscape',
            pageMargins: [30, 70, 30, 40],
            header: (currentPage: number) => {
                if (currentPage === 1) {
                    return {
                        columns: [
                            logo ? { image: logo, width: 60, height: 60 } : { text: '' },
                            {
                                text: 'REPORTE DE CONTROL VEHICULAR',
                                fontSize: 18,
                                bold: true,
                                alignment: 'center',
                                margin: [0, 20, 0, 0],
                                color: '#1565C0'
                            },
                            { text: '', width: 60 }
                        ],
                        margin: [30, 10, 30, 0]
                    };
                }
            },
            footer: (currentPage: number, pageCount: number) => ({
                text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
                alignment: 'center',
                fontSize: 9,
                margin: [0, 0, 0, 20],
                color: '#999'
            }),
            content: [
                {
                    columns: [
                        {
                            width: '30%',
                            stack: [
                                { text: 'ESTADÍSTICAS', bold: true, margin: [0, 10, 0, 10], color: '#1565C0' },
                                {
                                    table: {
                                        widths: ['70%', '30%'],
                                        body: [
                                            ['Total Accesos:', { text: total.toString(), bold: true }],
                                            ['Ingresos:', { text: ing.toString(), color: '#10b981', bold: true }],
                                            ['Salidas:', { text: sal.toString(), color: '#3b82f6', bold: true }]
                                        ]
                                    }
                                }
                            ]
                        },
                        {
                            width: 250,
                            image: chartImage,
                            alignment: 'center',
                            height: 180
                        }
                    ],
                    margin: [0, 0, 0, 20]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: ['12%', '12%', '8%', '12%', '10%', '10%', '10%', '24%'],
                        body: [
                            [
                                { text: 'F/H INGRESO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'F/H SALIDA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'PLACA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'CLIENTE', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'UNIDAD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'USUARIO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'ESTADO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'OBSERVACIONES', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 }
                            ],
                            ...tableData.map(fila => fila.map((cell, idx) => ({
                                text: cell,
                                fontSize: 8,
                                alignment: 'center',
                                color: idx === 6 ? (cell === 'INGRESO' ? '#10b981' : '#3b82f6') : '#333',
                                bold: idx === 6 || idx === 2
                            })))
                        ]
                    },
                    layout: {
                        fillColor: (i: number) => (i === 0 ? '#1565C0' : (i % 2 === 0 ? '#f9f9f9' : null)),
                        hLineWidth: () => 0.5,
                        vLineWidth: () => 0.5,
                        hLineColor: () => '#d0d0d0',
                        vLineColor: () => '#d0d0d0',
                        paddingLeft: () => 4,
                        paddingRight: () => 4,
                        paddingTop: () => 4,
                        paddingBottom: () => 4
                    }
                }
            ]
        };

        await exportToPDF(docDef, `ReporteControlVehicular_${Date.now()}.pdf`);
        UI.toast('PDF Exportado', 'success');
    } catch (e: any) {
        console.error('Error CV PDF:', e);
        UI.toast('Error al exportar PDF', 'error');
    } finally {
        UI.hideLoader();
    }
}

