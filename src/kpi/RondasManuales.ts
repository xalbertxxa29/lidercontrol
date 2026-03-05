import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import { getUnidadesByCliente, getAllClientes, exportToExcel, tsToDate } from '../utils';
import { getLogoBase64, generateChartImage, exportToPDF } from '../pdf-utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';

import 'daterangepicker';

let rmChoices: any = {};
let rmCharts: Record<string, Chart> = {};
let rmData: any[] = [];
let lastVisibleDoc: any = null;
let allLoadedDocs: any[] = [];
const PAGE_SIZE = 5000;
let rmCurrentPage = 1;
const ITEMS_PER_PAGE = 10;
let rmFilters = {
    cliente: '',
    unidad: '',
    fechaInicio: '',
    fechaFin: ''
};

export function initRondasManuales(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;

    container.innerHTML = `
    <!-- Filtros -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group"><label class="filter-label">Fecha / Rango</label><input type="text" id="kpiRMFecha" class="search-input" /></div>
        <div class="filter-group"><label class="filter-label">Cliente</label><select id="kpiRMCliente"><option value="Todos">Todos</option></select></div>
        <div class="filter-group"><label class="filter-label">Unidad</label><select id="kpiRMUnidad"><option value="Todas">Todas</option></select></div>
        <div class="filter-group" style="padding-bottom:2px"><button class="btn btn-primary" id="btnKPIRMBuscar">Buscar Registros</button></div>
        <div class="filter-group" style="padding-bottom:2px; margin-left:auto; display:flex; gap:8px">
          <button class="btn btn-success" id="btnKPIRMExcel">Excel</button>
          <button class="btn btn-danger" id="btnKPIRMPDF" style="background-color:#ef4444; border-color:#ef4444;">PDF</button>
        </div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div class="mini-stat" style="display:inline-block; border-left-color:var(--accent); background:var(--card-bg); border-radius:var(--radius)">
          <div class="mini-stat-num" id="kpiRMTotalNum">0</div>
          <div class="mini-stat-label">Total Rondas Manuales</div>
      </div>
    </div>

    <!-- Charts -->
    <div class="dashboard-grid grid-2" style="margin-bottom:16px">
      <div class="card chart-card col-span-2"><h4 class="card-title">Rondas por Fecha</h4><div class="chart-wrap" style="height:250px"><canvas id="chartRMFecha"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Categorizado por Punto</h4><div class="chart-wrap" style="height:300px"><canvas id="chartRMPorPunto"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Por Usuario</h4><div class="chart-wrap" style="height:300px"><canvas id="chartRMUsuario"></canvas></div></div>
      <div class="card chart-card col-span-2"><h4 class="card-title">Por Unidad</h4><div class="chart-wrap" style="height:300px"><canvas id="chartRMUnidad"></canvas></div></div>
    </div>

    <!-- Table -->
    <div class="card card-pad">
      <div class="table-wrap">
        <table id="tableRM" class="data-table">
          <thead>
            <tr>
              <th>FH Reg</th>
              <th>Vigilante</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Punto (QR)</th>
              <th>Pregunta</th>
              <th>Respuesta</th>
              <th>Puesto</th>
              <th>Estado</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody id="rm-tbody">
            <tr><td colspan="10" style="text-align:center;padding:30px">Sin resultados</td></tr>
          </tbody>
        </table>
      </div>
    <div id="rm-pagination" style="padding-top:14px;"></div>
  `;

    setupFilters();

}

async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    rmChoices.cliente = new Choices('#kpiRMCliente', cfg);
    rmChoices.unidad = new Choices('#kpiRMUnidad', cfg);

    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    rmFilters.fechaInicio = start.toISOString().split('T')[0];
    rmFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiRMFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], firstDay: 1 }
    });

    $('#kpiRMFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        rmFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        rmFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            rmChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            rmChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            rmChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            rmChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiRMCliente')?.addEventListener('change', async () => {
                const c = rmChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    rmChoices.unidad.clearChoices();
                    rmChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPIRMBuscar')?.addEventListener('click', () => applyFiltersAndFetch());
        document.getElementById('btnKPIRMExcel')?.addEventListener('click', exportToExcelFile);
        document.getElementById('btnKPIRMPDF')?.addEventListener('click', exportToPDFReport);
        setTimeout(() => applyFiltersAndFetch(), 500);
    } catch (e) {
        console.error('Error in RM setup:', e);
    }
}

async function loadUnidades(cliente: string) {
    rmChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        rmChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        rmChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        rmChoices.unidad.setChoiceByValue(unidades[0]);
        rmChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        rmChoices.unidad.setChoices(arr, 'value', 'label', true);
        rmChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch() {
    const cliente = rmChoices.cliente.getValue(true) || 'Todos';
    const unidad = rmChoices.unidad.getValue(true) || 'Todas';

    rmCurrentPage = 1;
    lastVisibleDoc = null;
    allLoadedDocs = [];
    const tbody = document.getElementById('rm-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px">Cargando...</td></tr>';

    UI.showLoader('Filtrando rondas...', 'Consultando servidor', 20);
    rmFilters.cliente = cliente === 'Todos' ? '' : cliente;
    rmFilters.unidad = unidad === 'Todas' ? '' : unidad;

    try {
        let q = query(collection(db, 'RONDA_MANUAL'), orderBy('timestamp', 'desc'), limit(PAGE_SIZE));



        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            q = query(q, where('cliente', '==', accessControl.state.clienteAsignado));
        } else if (rmFilters.cliente) {
            q = query(q, where('cliente', '==', rmFilters.cliente));
        }

        if (rmFilters.unidad) {
            q = query(q, where('unidad', '==', rmFilters.unidad));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            UI.toast('No se encontraron registros', 'info');
            document.getElementById('rm-load-more-container')!.style.display = 'none';

            UI.hideLoader();
            return;
        }




        const newRecords = snapshot.docs.map(doc => {
            const d = doc.data();
            let ts = tsToDate(d.fechaHora) || tsToDate(d.timestamp) || null;

            if (!ts && typeof d.fechaHora === 'string') {
                const m = moment(d.fechaHora, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']);
                if (m.isValid()) ts = m.toDate();
            }

            return { id: doc.id, ...d, _ts: ts };
        });

        newRecords.forEach(r => allLoadedDocs.push(r));

        let filtered = allLoadedDocs;
        if (rmFilters.fechaInicio || rmFilters.fechaFin) {
            const start = rmFilters.fechaInicio ? moment(rmFilters.fechaInicio).startOf('day') : null;
            const end = rmFilters.fechaFin ? moment(rmFilters.fechaFin).endOf('day') : null;
            filtered = filtered.filter(r => {
                if (!r._ts) return false;
                const m = moment(r._ts);
                if (start && m.isBefore(start)) return false;
                if (end && m.isAfter(end)) return false;
                return true;
            });
        }

        filtered.sort((a, b) => (b._ts || 0) - (a._ts || 0));

        rmData = filtered;
        drawCharts();
        renderTable();

        const totalEl = document.getElementById('kpiRMTotalNum');
        if (totalEl) totalEl.textContent = rmData.length.toLocaleString('es-PE');

    } catch (e) {
        console.error('Error in RM fetch:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function drawCharts() {
    drawFechaChart();
    drawPuntoChart();
    drawUsuarioChart();
    drawUnidadChart();
}

function drawFechaChart() {
    const ctx = document.getElementById('chartRMFecha') as HTMLCanvasElement;
    if (!ctx) return;
    if (rmCharts.fecha) rmCharts.fecha.destroy();

    const start = moment(rmFilters.fechaInicio);
    const end = moment(rmFilters.fechaFin);
    const labels = [];
    const map: Record<string, number> = {};

    for (let m = start.clone(); m.isSameOrBefore(end, 'day'); m.add(1, 'day')) {
        const k = m.format('DD/MM');
        labels.push(k);
        map[k] = 0;
    }

    rmData.forEach(r => {
        if (!r._ts) return;
        const k = moment(r._ts).format('DD/MM');
        if (map[k] !== undefined) map[k]++;
    });

    rmCharts.fecha = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Rondas', data: labels.map(l => map[l]), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
}

function drawPuntoChart() {
    const ctx = document.getElementById('chartRMPorPunto') as HTMLCanvasElement;
    if (!ctx) return;
    if (rmCharts.punto) rmCharts.punto.destroy();

    const counts: Record<string, number> = {};
    rmData.forEach(r => { const p = r.nombrePunto || 'S/P'; counts[p] = (counts[p] || 0) + 1; });

    rmCharts.punto = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
    });
}

function drawUsuarioChart() {
    const ctx = document.getElementById('chartRMUsuario') as HTMLCanvasElement;
    if (!ctx) return;
    if (rmCharts.usuario) rmCharts.usuario.destroy();

    const counts: Record<string, number> = {};
    rmData.forEach(r => { const u = r.usuario || r.user || r.nombreUsuario || 'Anónimo'; counts[u] = (counts[u] || 0) + 1; });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(x => x[0]);
    const data = sorted.map(x => x[1]);

    rmCharts.usuario = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Registros', data, backgroundColor: '#3b82f6' }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', stepSize: 1 } }, y: { ticks: { color: '#94a3b8' } } } }
    });
}

function drawUnidadChart() {
    const ctx = document.getElementById('chartRMUnidad') as HTMLCanvasElement;
    if (!ctx) return;
    if (rmCharts.unidad) rmCharts.unidad.destroy();

    const counts: Record<string, number> = {};
    rmData.forEach(r => { const u = r.unidad || 'S/U'; counts[u] = (counts[u] || 0) + 1; });

    const labels = Object.keys(counts).sort();
    rmCharts.unidad = new Chart(ctx, {
        type: 'bar',

        data: { labels, datasets: [{ label: 'Registros', data: labels.map(l => counts[l]), backgroundColor: '#10b981' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 10 } } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
}

function renderTable() {
    const tbody = document.getElementById('rm-tbody');
    if (!tbody) return;

    if (rmData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px">Sin resultados</td></tr>';
        const pg = document.getElementById('rm-pagination'); if (pg) pg.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(rmData.length / ITEMS_PER_PAGE);
    if (rmCurrentPage > totalPages) rmCurrentPage = totalPages;
    const start = (rmCurrentPage - 1) * ITEMS_PER_PAGE;
    const pageData = rmData.slice(start, start + ITEMS_PER_PAGE);

    let html = '';
    pageData.forEach(r => {
        const fh = r._ts ? r._ts.toLocaleString('es-PE') : '-';
        const user = r.usuario || r.user || r.nombreUsuario || '-';

        let q = '', ans = '';
        if (r.preguntas && typeof r.preguntas === 'object') {
            const keys = Object.keys(r.preguntas);
            if (keys.length > 0) q = r.preguntas[keys[0]];
        }
        if (r.respuestas && typeof r.respuestas === 'object') {
            const keys = Object.keys(r.respuestas);
            if (keys.length > 0) ans = r.respuestas[keys[0]];
        }

        let st = r.estado || r.status || '';
        let estado = st.toUpperCase();
        let color = '#94a3b8';
        if (estado === 'FINALIZADO' || estado === 'COMPLETADO' || estado === 'OK') color = '#22c55e';
        else if (estado === 'EN PROCESO' || estado === 'EN_PROCESO') color = '#3b82f6';
        else if (estado === 'OBSERVADO' || estado === 'CON_OBSERVACION') color = '#f59e0b';

        let imgHtml = '<span style="color:#94a3b8;font-size:11px">Sin foto</span>';
        if (r.fotoURL) {
            imgHtml = `<img src="${r.fotoURL}" style="width:40px;height:40px;border-radius:4px;object-fit:cover;cursor:pointer" />`;
        } else if (r.fotos && Array.isArray(r.fotos) && r.fotos.length > 0) {
            imgHtml = `<img src="${r.fotos[0]}" style="width:40px;height:40px;border-radius:4px;object-fit:cover;cursor:pointer" />`;
        }

        html += `<tr>
            <td>${fh}</td>
            <td>${user}</td>
            <td>${r.cliente || '-'}</td>
            <td>${r.unidad || '-'}</td>
            <td>${r.codigoQRleido || r.qrId || '-'}</td>
            <td>${q || '-'}</td>
            <td>${ans || '-'}</td>
            <td>${r.puesto || '-'}</td>
            <td style="text-align:center"><span style="background:${color}20;color:${color};padding:4px 12px;border-radius:12px;font-size:11px;font-weight:bold">${estado}</span></td>
            <td style="text-align:center">${imgHtml}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    renderRMPagination(totalPages);
}

async function exportToExcelFile() {
    if (!rmData.length) {
        alert('No hay datos para exportar.');
        return;
    }
    const data = rmData.map(r => {
        let q = '', ans = '';
        if (r.preguntas && typeof r.preguntas === 'object') {
            const keys = Object.keys(r.preguntas);
            if (keys.length > 0) q = r.preguntas[keys[0]];
        }
        if (r.respuestas && typeof r.respuestas === 'object') {
            const keys = Object.keys(r.respuestas);
            if (keys.length > 0) ans = r.respuestas[keys[0]];
        }

        return {
            'FECHA REGISTRO': r._ts ? r._ts.toLocaleString('es-PE') : '-',
            'VIGILANTE': r.usuario || r.user || r.nombreUsuario || '-',
            'CLIENTE': r.cliente || '-',
            'UNIDAD': r.unidad || '-',
            'QR': r.codigoQRleido || r.qrId || '-',
            'PREGUNTA': q,
            'RESPUESTA': ans,
            'PUESTO': r.puesto || '-',
            'ESTADO': (r.respuestas && Object.keys(r.respuestas).length > 0) ? 'Completada' : 'Pendiente'
        };
    });

    await exportToExcel(data, `RondasManuales_${new Date().toISOString().split('T')[0]}`,
        ['FECHA REGISTRO', 'VIGILANTE', 'CLIENTE', 'UNIDAD', 'QR', 'PREGUNTA', 'RESPUESTA', 'PUESTO', 'ESTADO']
    );
}

async function exportToPDFReport() {
    if (!rmData.length) {
        UI.toast('No hay datos para exportar', 'warning');
        return;
    }

    UI.showLoader('Generando PDF...', 'Preparando reporte de Rondas Manuales');

    try {
        const logo = await getLogoBase64();

        // Stats for Chart (Puntos)
        const counts: Record<string, number> = {};
        rmData.forEach(r => { const p = r.nombrePunto || 'S/P'; counts[p] = (counts[p] || 0) + 1; });
        const labels = Object.keys(counts);
        const data = Object.values(counts);

        const chartImage = await generateChartImage(
            labels.map((l, i) => `${l}: ${data[i]}`),
            data,
            ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6']
        );

        const tableData = rmData.map(r => {
            let q = '', ans = '';
            if (r.preguntas && typeof r.preguntas === 'object') {
                const keys = Object.keys(r.preguntas);
                if (keys.length > 0) q = r.preguntas[keys[0]];
            }
            if (r.respuestas && typeof r.respuestas === 'object') {
                const keys = Object.keys(r.respuestas);
                if (keys.length > 0) ans = r.respuestas[keys[0]];
            }

            return [
                r._ts ? r._ts.toLocaleString('es-PE') : '-',
                r.usuario || r.user || r.nombreUsuario || '-',
                r.cliente || '-',
                r.unidad || '-',
                r.codigoQRleido || r.qrId || '-',
                q,
                ans,
                r.estado || '-'
            ];
        });

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
                                text: 'REPORTE DE RONDAS MANUALES (INSPECCIONES)',
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
                                { text: 'RESUMEN', bold: true, margin: [0, 10, 0, 10], color: '#1565C0' },
                                {
                                    table: {
                                        widths: ['70%', '30%'],
                                        body: [
                                            ['Total Registros:', { text: rmData.length.toString(), bold: true }],
                                            ['Puntos Visitados:', { text: labels.length.toString(), bold: true }]
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
                        widths: ['12%', '12%', '10%', '10%', '10%', '18%', '18%', '10%'],
                        body: [
                            [
                                { text: 'FECHA/HORA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'VIGILANTE', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'CLIENTE', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'UNIDAD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'PUNTO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'PREGUNTA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'RESPUESTA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'ESTADO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 }
                            ],
                            ...tableData.map(fila => fila.map((cell, idx) => ({
                                text: cell,
                                fontSize: 8,
                                alignment: 'center',
                                bold: idx === 7
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

        await exportToPDF(docDef, `ReporteRondasManuales_${Date.now()}.pdf`);
        UI.toast('PDF Exportado', 'success');
    } catch (e: any) {
        console.error('Error RM PDF:', e);
        UI.toast('Error al exportar PDF', 'error');
    } finally {
        UI.hideLoader();
    }
}


function renderRMPagination(totalPages: number) {
    const container = document.getElementById('rm-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const rangeStart = (rmCurrentPage - 1) * ITEMS_PER_PAGE + 1;
    const rangeEnd = Math.min(rmCurrentPage * ITEMS_PER_PAGE, rmData.length);

    let pages: (number | string)[] = [];
    if (totalPages <= 7) {
        pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
        pages = [1];
        if (rmCurrentPage > 3) pages.push('...');
        const lo = Math.max(2, rmCurrentPage - 1);
        const hi = Math.min(totalPages - 1, rmCurrentPage + 1);
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (rmCurrentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    const btnS = (active: boolean, dis = false) =>
        'style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border-radius:6px;border:1px solid ' + (active ? 'var(--accent)' : 'rgba(255,255,255,0.1)') + ';background:' + (active ? 'var(--accent)' : 'transparent') + ';color:' + (active ? '#fff' : dis ? 'rgba(255,255,255,0.25)' : '#cbd5e1') + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:' + (dis ? 'default' : 'pointer') + ';"';

    let html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:4px 0;">' +
        '<span style="font-size:12px;color:var(--text-muted)">Mostrando <strong style="color:var(--text)">' + rangeStart + '&ndash;' + rangeEnd + '</strong> de <strong style="color:var(--text)">' + rmData.length + '</strong> registros</span>' +
        '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">' +
        '<button id="rm-pg-prev" ' + btnS(false, rmCurrentPage === 1) + (rmCurrentPage === 1 ? ' disabled' : '') + '>&lsaquo;</button>';

    pages.forEach((p: any) => {
        if (p === '...') {
            html += '<span style="color:var(--text-muted);padding:0 3px;font-size:13px;">&#8230;</span>';
        } else {
            html += '<button class="rm-pg-num" data-page="' + p + '" ' + btnS(p === rmCurrentPage, false) + '>' + p + '</button>';
        }
    });

    html += '<button id="rm-pg-next" ' + btnS(false, rmCurrentPage === totalPages) + (rmCurrentPage === totalPages ? ' disabled' : '') + '>&rsaquo;</button>' +
        '</div></div>';

    container.innerHTML = html;

    document.getElementById('rm-pg-prev')?.addEventListener('click', () => {
        if (rmCurrentPage > 1) { rmCurrentPage--; renderTable(); }
    });
    document.getElementById('rm-pg-next')?.addEventListener('click', () => {
        if (rmCurrentPage < totalPages) { rmCurrentPage++; renderTable(); }
    });
    container.querySelectorAll('.rm-pg-num').forEach((b: any) => {
        b.addEventListener('click', () => {
            rmCurrentPage = parseInt(b.dataset.page || '1');
            renderTable();
        });
    });
}
