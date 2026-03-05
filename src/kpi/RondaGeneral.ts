import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { accessControl } from '../access-control';
import { tsToDate, getUnidadesByCliente, getAllClientes } from '../utils';
import { getLogoBase64, generateChartImage, exportToPDF } from '../pdf-utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';
import { UI } from '../ui';

import 'daterangepicker';

let rgChoices: any = {};
let chartEstado: Chart | null = null;
let chartUnidad: Chart | null = null;
let chartFecha: Chart | null = null;
let rgData: any[] = [];
let rgFilters = {
    cliente: '',
    unidad: '',
    fechaInicio: '',
    fechaFin: ''
};
let rgCurrentPage = 1;
const RG_PAGE_SIZE = 10;

export function initRondaGeneral(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;
    if (container.innerHTML.trim() !== '') return;

    container.innerHTML = `
    <!-- Filtros + Stats inline -->
    <div style="display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
      
      <!-- Box de Filtros -->
      <div class="card card-pad" style="flex: 2.5; display: flex; flex-direction: column; min-width: 300px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--text);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span style="font-weight: 700; font-size: 14px;">FILTROS</span>
        </div>
        
        <div class="filters-bar" style="padding:0; align-items:flex-end; gap: 16px; border:none; background:transparent; flex-wrap: wrap;">
          <div class="filter-group" style="flex:1;">
            <label class="filter-label" style="display:flex; align-items:center; gap:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              CLIENTE
            </label>
            <select id="kpiRondaGenCliente" class="search-input"><option value="Todos">Todos</option></select>
          </div>
          
          <div class="filter-group" style="flex:1;">
            <label class="filter-label" style="display:flex; align-items:center; gap:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
              UNIDAD
            </label>
            <select id="kpiRondaGenUnidad" class="search-input"><option value="Todas">Todas</option></select>
          </div>
          
          <div class="filter-group" style="flex:1.5;">
            <label class="filter-label" style="display:flex; align-items:center; gap:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              FECHA INICIO - FIN
            </label>
            <input type="text" id="kpiRondaGenFecha" class="search-input" />
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 16px;">
          <button class="btn btn-primary" id="btnKPIRondaGenBuscar" style="flex: 1; justify-content: center; padding: 10px; font-weight: 600;">Generar Reporte</button>
          <button class="btn btn-danger" id="btnKPIRondaGenPDF" style="background-color:#ef4444; border-color:#ef4444; color:white; padding: 10px; font-weight: 600; flex: 0.5; justify-content: center;">PDF</button>
        </div>
      </div>

      <!-- Box Total de Registros -->
      <div class="card card-pad" style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: rgba(255, 255, 255, 0.02); min-width: 200px;">
        <div style="display: flex; align-items: center; gap: 6px; color: #3b82f6; font-size: 13px; font-weight: 700; margin-bottom: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          TOTAL DE REGISTROS
        </div>
        <div id="kpiRGTotalNum" style="font-size: 48px; font-weight: 900; color: #3b82f6; line-height: 1; margin: 8px 0;">0</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Últimos registros</div>
      </div>
    </div>

    <!-- Charts Top Row: Dona y Barras (Grid 2 columnas) -->
    <div class="dashboard-grid grid-2" style="gap: 16px; margin-bottom: 20px;">
      <div class="card chart-card" style="padding:16px">
        <h4 class="card-title" style="display: flex; align-items: center; gap: 6px; margin-bottom: 16px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
          Estado de Rondas
        </h4>
        <div class="risk-dashboard">
          <div class="risk-chart-area">
            <div class="chart-wrap" style="height:220px;"><canvas id="chartRGEstado"></canvas></div>
            <div class="risk-total-center">
              <div class="risk-total-num" id="rg-total-estado-num">0</div>
              <div class="risk-total-label">TOTAL</div>
            </div>
          </div>
          <div class="risk-bars-area" id="rg-estado-bars">
            <!-- Barras generadas dinámicamente -->
          </div>
        </div>
      </div>
      <div class="card chart-card" style="padding:16px">
        <h4 class="card-title" style="display: flex; align-items: center; gap: 6px; margin-bottom: 16px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          Rondas por Unidad
        </h4>
        <div class="chart-wrap" style="height:250px;"><canvas id="chartRGUnidad"></canvas></div>
      </div>
    </div>

    <!-- Charts Bottom Row: Gráfico de Línea -->
    <div class="card chart-card" style="padding:16px; margin-bottom: 20px;">
      <h4 class="card-title" style="display: flex; align-items: center; gap: 6px; margin-bottom: 16px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        Rondas por Fecha y Estado
      </h4>
      <div class="chart-wrap" style="height:280px"><canvas id="chartRGFecha"></canvas></div>
    </div>

    <!-- Table -->
    <div class="card card-pad" style="margin-top:16px">
      <h3 style="margin-bottom: 16px; font-size: 14px; color: var(--accent);">Detalle General de Rondas</h3>
      <div class="table-wrap">
        <table id="tableRG" class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora Inicio</th>
              <th>Unidad</th>
              <th>Nombre Ronda</th>
              <th>QR Reg</th>
              <th>QR Sin Reg</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody id="kpi-ronda-tabla-body">
            <tr><td colspan="7" style="text-align:center;padding:30px">Sin resultados</td></tr>
          </tbody>
        </table>
      </div>
      <div id="rg-pagination" style="padding-top:12px;"></div>
    </div>

  `;

    setupFilters();
}
async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    rgChoices.cliente = new Choices('#kpiRondaGenCliente', cfg);
    rgChoices.unidad = new Choices('#kpiRondaGenUnidad', cfg);

    // Initial dates (last 2 days)
    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    rgFilters.fechaInicio = start.toISOString().split('T')[0];
    rgFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiRondaGenFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Limpiar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'], monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] }
    });

    $('#kpiRondaGenFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        rgFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        rgFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state?.clienteAsignado) {
            rgChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            rgChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            rgChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            rgChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiRondaGenCliente')?.addEventListener('change', async () => {
                const c = rgChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    rgChoices.unidad.clearChoices();
                    rgChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPIRondaGenBuscar')?.addEventListener('click', () => applyFiltersAndFetch());
        document.getElementById('btnKPIRondaGenPDF')?.addEventListener('click', exportToPDFReport);

        setTimeout(() => applyFiltersAndFetch(), 300);
    } catch (e) {
        console.error('Error in RG setup:', e);
    }
}

async function loadUnidades(cliente: string) {
    rgChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        rgChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        rgChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        rgChoices.unidad.setChoiceByValue(unidades[0]);
        rgChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        rgChoices.unidad.setChoices(arr, 'value', 'label', true);
        rgChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch() {
    const cliente = rgChoices.cliente.getValue(true) || 'Todos';
    const unidad = rgChoices.unidad.getValue(true) || 'Todas';

    rgFilters.cliente = cliente === 'Todos' ? '' : cliente;
    rgFilters.unidad = unidad === 'Todas' ? '' : unidad;

    // Sincronizar fechas del picker por seguridad
    const picker = ($('#kpiRondaGenFecha') as any).data('daterangepicker');
    if (picker) {
        rgFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        rgFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    }

    UI.showLoader('Consultando Rondas...', 'Buscando registros', 20);

    try {
        let q = query(collection(db, 'RONDAS_COMPLETADAS'), limit(2000));

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state?.clienteAsignado) {
            q = query(q, where('cliente', '==', accessControl.state.clienteAsignado));
        } else if (rgFilters.cliente) {
            q = query(q, where('cliente', '==', rgFilters.cliente));
        }

        if (rgFilters.unidad) {
            q = query(q, where('unidad', '==', rgFilters.unidad));
        }

        const snapshot = await getDocs(q);
        let records = snapshot.docs.map(doc => {
            const data = doc.data();
            let dateObj = tsToDate(data.horarioInicio);
            // fallback if horarioInicio is string
            if (!dateObj && typeof data.horarioInicio === 'string') {
                const d = new Date(data.horarioInicio);
                if (!isNaN(d.getTime())) dateObj = d;
            }
            return { id: doc.id, ...data, _dateObj: dateObj };
        });

        if (rgFilters.fechaInicio || rgFilters.fechaFin) {
            const start = rgFilters.fechaInicio ? new Date(rgFilters.fechaInicio + 'T00:00:00') : null;
            const end = rgFilters.fechaFin ? new Date(rgFilters.fechaFin + 'T23:59:59') : null;
            records = records.filter(r => {
                if (!r._dateObj) return false;
                if (start && r._dateObj < start) return false;
                if (end && r._dateObj > end) return false;
                return true;
            });
        }

        records.sort((a, b) => {
            const tA = a._dateObj ? a._dateObj.getTime() : 0;
            const tB = b._dateObj ? b._dateObj.getTime() : 0;
            return tB - tA;
        });

        rgData = records;

        const totalEl = document.getElementById('kpiRGTotalNum');
        if (totalEl) totalEl.textContent = rgData.length.toLocaleString('es-PE');

        drawEstadoChart();
        drawUnidadesChart();
        drawFechaChart();
        renderTable();

    } catch (e) {
        console.error('Error fetching Ronda General:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function drawEstadoChart() {
    const canvas = document.getElementById('chartRGEstado') as HTMLCanvasElement;
    if (!canvas) return;
    if (chartEstado) chartEstado.destroy();

    const counts: Record<string, number> = {};
    const estados = ['TERMINADA', 'INCOMPLETA', 'NO REALIZADA', 'EN_PROCESO'];
    estados.forEach(e => counts[e] = 0);

    rgData.forEach(r => {
        let st = r.estado || 'NO REALIZADA';
        if (st === 'NO_REALIZADA') st = 'NO REALIZADA';
        if (st === 'EN_PROGRESO') st = 'EN_PROCESO';
        if (st === 'INCOMPLETADA') st = 'INCOMPLETA';
        if (estados.includes(st)) counts[st]++;
        else counts['NO REALIZADA']++;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const totalEl = document.getElementById('rg-total-estado-num');
    if (totalEl) totalEl.textContent = total.toString();

    const colors: Record<string, string> = {
        'TERMINADA': '#22c55e',
        'INCOMPLETA': '#f59e0b',
        'NO REALIZADA': '#ef4444',
        'EN_PROCESO': '#3b82f6'
    };

    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const bgColors = labels.map(l => colors[l] || '#6366f1');

    chartEstado = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors,
                borderColor: 'transparent',
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            }
        }
    });

    // Inyectar barras
    const barsContainer = document.getElementById('rg-estado-bars');
    if (barsContainer) {
        barsContainer.innerHTML = labels.map(label => {
            const count = counts[label];
            const perc = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = colors[label];
            return `
        <div class="risk-bar-item">
          <div class="risk-bar-header">
            <div class="risk-bar-label">
              <div class="risk-dot" style="background: ${color}"></div>
              ${label.charAt(0) + label.slice(1).toLowerCase()}
            </div>
            <div class="risk-bar-perc">${perc}%</div>
          </div>
          <div class="risk-bar-track">
            <div class="risk-bar-fill" style="width: ${perc}%; background: linear-gradient(90deg, ${color}dd, ${color})"></div>
          </div>
        </div>
      `;
        }).join('');
    }
}
function drawUnidadesChart() {
    const ctx = document.getElementById('chartRGUnidad') as HTMLCanvasElement;
    if (!ctx) return;
    if (chartUnidad) chartUnidad.destroy();

    const counts: Record<string, number> = {};
    rgData.forEach(r => {
        const u = r.unidad || 'Sin unidad';
        counts[u] = (counts[u] || 0) + 1;
    });

    const labels = Object.keys(counts).sort();
    const data = labels.map(l => counts[l]);

    chartUnidad = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Rondas',
                data,
                backgroundColor: (data as number[]).map((v: number) => {
                    const max = Math.max(...(data as number[])) || 1;
                    const intensity = 0.45 + (v / max * 0.55);
                    return `rgba(59,130,246,${intensity.toFixed(2)})`;
                }),
                borderColor: 'transparent',
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 10,
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: { label: (c) => ` ${c.parsed.x} rondas` }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', stepSize: 5, font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    border: { display: false }
                },
                y: {
                    ticks: { color: '#e2e8f0', font: { size: 11, weight: 'bold' } },
                    grid: { display: false },
                    border: { display: false }
                }
            }
        }
    });
}
function drawFechaChart() {
    const ctx = document.getElementById('chartRGFecha') as HTMLCanvasElement;
    if (!ctx) return;
    if (chartFecha) chartFecha.destroy();

    const byDate: Record<string, any> = {};
    rgData.forEach(r => {
        if (!r._dateObj) return;
        const iso = r._dateObj.toISOString().split('T')[0];
        if (!byDate[iso]) byDate[iso] = { 'TERMINADA': 0, 'INCOMPLETA': 0, 'NO REALIZADA': 0 };

        let st = r.estado || 'NO REALIZADA';
        if (st === 'NO_REALIZADA') st = 'NO REALIZADA';
        if (st === 'INCOMPLETADA') st = 'INCOMPLETA';

        if (st === 'TERMINADA') byDate[iso]['TERMINADA']++;
        else if (st === 'INCOMPLETA') byDate[iso]['INCOMPLETA']++;
        else if (st === 'NO REALIZADA') byDate[iso]['NO REALIZADA']++;
    });

    const sortedDates = Object.keys(byDate).sort();
    const labels = sortedDates.map(k => { const p = k.split('-'); return `${p[2]} /${p[1]}/${p[0]} `; });
    const term = sortedDates.map(k => byDate[k]['TERMINADA']);
    const inc = sortedDates.map(k => byDate[k]['INCOMPLETA']);
    const nrz = sortedDates.map(k => byDate[k]['NO REALIZADA']);

    chartFecha = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Completadas', data: term, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#22c55e' },
                { label: 'Incompletas', data: inc, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#f59e0b' },
                { label: 'No realizadas', data: nrz, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#cbd5e1', font: { size: 12 }, padding: 16, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 10,
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1
                }
            },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        },
        plugins: [{
            id: 'rgLineLabels',
            afterDatasetsDraw(chart: any) {
                const ctx2 = chart.ctx;
                chart.data.datasets.forEach((dataset: any, i: number) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    const color = dataset.borderColor as string;
                    meta.data.forEach((point: any, index: number) => {
                        const val = dataset.data[index] as number;
                        if (!val) return;
                        ctx2.save();
                        ctx2.font = 'bold 10px sans-serif';
                        ctx2.fillStyle = color;
                        ctx2.textAlign = 'center';
                        ctx2.textBaseline = 'bottom';
                        ctx2.shadowColor = 'rgba(0,0,0,0.8)';
                        ctx2.shadowBlur = 4;
                        ctx2.fillText(String(val), point.x, point.y - 6);
                        ctx2.restore();
                    });
                });
            }
        }]
    });
}

function renderTable() {
    const tbody = document.getElementById('kpi-ronda-tabla-body');
    if (!tbody) return;

    if (rgData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px">Sin resultados</td></tr>';
        const pg = document.getElementById('rg-pagination');
        if (pg) pg.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(rgData.length / RG_PAGE_SIZE);
    if (rgCurrentPage > totalPages) rgCurrentPage = totalPages;
    const start = (rgCurrentPage - 1) * RG_PAGE_SIZE;
    const pageData = rgData.slice(start, start + RG_PAGE_SIZE);

    let html = '';
    pageData.forEach(r => {
        let fecha = '-';
        let hora = '-';
        if (r._dateObj) {
            fecha = r._dateObj.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
            hora = r._dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        let qrReg = 0;
        let qrSinReg = 0;
        const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
        if (pArray.length > 0) {
            pArray.forEach((p: any) => {
                if (p.qrEscaneado) qrReg++; else qrSinReg++;
            });
        } else {
            qrReg = r.puntosCompletados || 0;
            qrSinReg = (r.puntosTotales || 0) - qrReg;
        }

        let stc = '#9ca3af';
        const st = r.estado || '';
        if (st === 'TERMINADA') stc = '#22c55e';
        else if (st === 'INCOMPLETA' || st === 'INCOMPLETADA') stc = '#f59e0b';
        else if (st === 'NO REALIZADA' || st === 'NO_REALIZADA') stc = '#ef4444';
        else if (st === 'EN_PROCESO' || st === 'EN PROGRESO') stc = '#3b82f6';

        html += `<tr>
          <td>${fecha}</td>
          <td>${hora}</td>
          <td>${r.unidad || '-'}</td>
          <td>${r.nombre || '-'}</td>
          <td style="color:#22c55e;font-weight:bold;text-align:center">${qrReg}</td>
          <td style="color:#ef4444;font-weight:bold;text-align:center">${qrSinReg}</td>
          <td style="text-align:center"><span style="background:${stc};color:#fff;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:700">${st}</span></td>
        </tr>`;
    });
    tbody.innerHTML = html;

    renderRGPagination(totalPages);
}

function renderRGPagination(totalPages: number) {
    const container = document.getElementById('rg-pagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const rangeStart = (rgCurrentPage - 1) * RG_PAGE_SIZE + 1;
    const rangeEnd = Math.min(rgCurrentPage * RG_PAGE_SIZE, rgData.length);

    let pages: (number | string)[] = [];
    if (totalPages <= 7) {
        pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
        pages = [1];
        if (rgCurrentPage > 3) pages.push('...');
        const lo = Math.max(2, rgCurrentPage - 1);
        const hi = Math.min(totalPages - 1, rgCurrentPage + 1);
        for (let i = lo; i <= hi; i++) pages.push(i);
        if (rgCurrentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    const btnS = (active: boolean, dis: boolean = false) =>
        `style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border-radius:6px;border:1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};background:${active ? 'var(--accent)' : 'transparent'};color:${active ? '#fff' : dis ? 'rgba(255,255,255,0.25)' : '#cbd5e1'};font-size:12px;font-weight:${active ? '700' : '500'};cursor:${dis ? 'default' : 'pointer'};"`

    let html2 = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:4px 0;">
      <span style="font-size:12px;color:var(--text-muted)">Mostrando <strong style="color:var(--text)">${rangeStart}&ndash;${rangeEnd}</strong> de <strong style="color:var(--text)">${rgData.length}</strong> registros</span>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        <button id="rg-pg-prev" ${btnS(false, rgCurrentPage === 1)} ${rgCurrentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;

    pages.forEach((p: any) => {
        if (p === '...') {
            html2 += `<span style="color:var(--text-muted);padding:0 3px;font-size:13px;">&#8230;</span>`;
        } else {
            html2 += `<button class="rg-pg-num" data-page="${p}" ${btnS(p === rgCurrentPage, false)}>${p}</button>`;
        }
    });

    html2 += `<button id="rg-pg-next" ${btnS(false, rgCurrentPage === totalPages)} ${rgCurrentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>
      </div></div>`;

    container.innerHTML = html2;

    document.getElementById('rg-pg-prev')?.addEventListener('click', () => {
        if (rgCurrentPage > 1) { rgCurrentPage--; renderTable(); }
    });
    document.getElementById('rg-pg-next')?.addEventListener('click', () => {
        if (rgCurrentPage < totalPages) { rgCurrentPage++; renderTable(); }
    });
    container.querySelectorAll('.rg-pg-num').forEach((b: any) => {
        b.addEventListener('click', () => {
            rgCurrentPage = parseInt(b.dataset.page || '1');
            renderTable();
        });
    });
}

async function exportToPDFReport() {
    if (!rgData.length) {
        UI.toast('No hay datos para exportar', 'warning');
        return;
    }

    UI.showLoader('Generando PDF...', 'Preparando reporte de Ronda General');

    try {
        const logo = await getLogoBase64();

        // Stats for Chart
        const statusCounts: Record<string, number> = {};
        rgData.forEach(r => {
            const st = (r.estado || 'N/A').toUpperCase().replace('_', ' ');
            statusCounts[st] = (statusCounts[st] || 0) + 1;
        });

        const labels = Object.keys(statusCounts);
        const data = Object.values(statusCounts);
        const colors = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

        const chartImage = await generateChartImage(
            labels.map((l, i) => `${l}: ${data[i]}`),
            data,
            colors.slice(0, labels.length)
        );

        const tableData = rgData.map(r => {
            let fecha = '-';
            let hora = '-';
            if (r.horarioInicio) {
                const d = tsToDate(r.horarioInicio);
                if (d) {
                    fecha = d.toLocaleDateString('es-PE');
                    hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
                }
            }

            let qrReg = 0, qrSin = 0;
            const pArray = Array.isArray(r.puntosRegistrados) ? r.puntosRegistrados : (r.puntosRegistrados ? Object.values(r.puntosRegistrados) : []);
            if (pArray.length > 0) {
                pArray.forEach((p: any) => { if (p.qrEscaneado) qrReg++; else qrSin++; });
            } else {
                qrReg = r.puntosCompletados || 0;
                qrSin = (r.puntosTotales || 0) - qrReg;
            }

            return [
                fecha,
                hora,
                r.unidad || '-',
                r.nombre || '-',
                qrReg.toString(),
                qrSin.toString(),
                (r.estado || 'N/A').toUpperCase().replace('_', ' ')
            ];
        });

        const docDef: any = {
            pageSize: 'A4',
            pageMargins: [40, 70, 40, 40],
            header: (currentPage: number) => {
                if (currentPage === 1) {
                    return {
                        columns: [
                            logo ? { image: logo, width: 60, height: 60 } : { text: '' },
                            {
                                text: 'REPORTE DE RONDA GENERAL',
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
            footer: (currentPage: number, pageCount: number) => ({
                text: `Página ${currentPage} de ${pageCount} | Generado: ${new Date().toLocaleString('es-PE')}`,
                alignment: 'center',
                fontSize: 9,
                margin: [0, 0, 0, 20],
                color: '#999'
            }),
            content: [
                {
                    text: 'Resumen Estadístico',
                    fontSize: 14,
                    bold: true,
                    margin: [0, 10, 0, 15],
                    color: '#1565C0'
                },
                {
                    columns: [
                        {
                            width: '40%',
                            table: {
                                widths: ['70%', '30%'],
                                body: [
                                    [{ text: 'Total Registros:', bold: true }, { text: rgData.length.toString(), bold: true, alignment: 'center' }],
                                    ...labels.map((l, i) => [l + ':', { text: data[i].toString(), alignment: 'center' }])
                                ]
                            }
                        },
                        {
                            width: 250,
                            alignment: 'center',
                            image: chartImage,
                            height: 180
                        }
                    ],
                    margin: [0, 0, 0, 30]
                },
                {
                    text: 'Detalle de Rondas',
                    fontSize: 12,
                    bold: true,
                    margin: [0, 10, 0, 10],
                    color: '#1565C0'
                },
                {
                    table: {
                        headerRows: 1,
                        widths: ['12%', '10%', '15%', '25%', '10%', '10%', '18%'],
                        body: [
                            [
                                { text: 'FECHA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'HORA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'UNIDAD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'RONDA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'REG', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'NO REG', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                                { text: 'ESTADO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 }
                            ],
                            ...tableData.map(fila => fila.map((cell, idx) => ({
                                text: cell,
                                fontSize: 8,
                                alignment: 'center',
                                color: idx === 4 ? '#059669' : (idx === 5 ? '#dc2626' : '#333'),
                                bold: idx === 4 || idx === 5
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

        await exportToPDF(docDef, `ReporteRondaGeneral_${Date.now()}.pdf`);
        UI.toast('PDF Exportado', 'success');
    } catch (e: any) {
        console.error('Error PDF Ronda General:', e);
        UI.toast('Error al exportar PDF', 'error');
    } finally {
        UI.hideLoader();
    }
}
