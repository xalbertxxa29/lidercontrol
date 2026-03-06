import { db } from '../firebase';
import { collection, query, where, getDocs, limit, startAfter } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import { tsToDate, getUnidadesByCliente, getAllClientes, exportToExcel } from '../utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment } from '../globals';

let detalleChoices: any = {};
let detalleChart: Chart | null = null;
let lastDetalleData: any = null;
let allLoadedRecords: any[] = [];
const PAGE_SIZE = 5000;
const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORS = ['#7c3aed', '#2563eb', '#06b6d4', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#6366f1', '#ec4899'];

export function initDetalleIncidentes(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;
    if (container.innerHTML.trim() !== '') return;

    container.innerHTML = `
    <!-- Filtros -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group">
          <label class="filter-label">Cliente</label>
          <select id="kpiDetIncCliente"><option value="Todos">Todos</option></select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Unidad</label>
          <select id="kpiDetIncUnidad"><option value="Todas">Todas</option></select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Año</label>
          <select id="kpiDetIncYear"></select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Rango de Fecha</label>
          <input type="text" id="kpiDetIncFechaRange" class="search-input" placeholder="Seleccionar fechas" />
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnKPIDetIncBuscar">Aplicar Filtros</button>
        </div>
        <div class="filter-group" style="padding-bottom:2px; margin-left:auto">
          <button class="btn btn-success" id="btnKPIDetIncExcel">Exportar Excel</button>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 3.2fr 1fr; align-items: stretch; gap: 16px;">
      <!-- Chart Area -->
      <div class="card chart-card" style="min-height:480px; display: flex; flex-direction: column;">
        <h4 class="card-title" style="margin-bottom: 12px; font-weight: 700;">Análisis de Incidentes por Categoría</h4>
        <div class="chart-wrap" style="flex:1; position: relative;"><canvas id="chartDetalleInc"></canvas></div>
      </div>

      <!-- Stats List (Sidebar) -->
      <div id="detalle-sidebar-stats" style="display:grid; grid-template-columns: 1fr; gap: 12px; align-content: start; overflow-y: auto; max-height: 480px; padding-right: 4px;">
        <!-- Generado dinámicamente -->
      </div>
    </div>

    <!-- Tables Wrapper -->
    <div id="detalle-tables-wrapper" style="margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap:16px;"></div>
  `;

    setupDetalleFilters();
}

async function setupDetalleFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    detalleChoices.cliente = new Choices('#kpiDetIncCliente', cfg);
    detalleChoices.unidad = new Choices('#kpiDetIncUnidad', cfg);
    detalleChoices.year = new Choices('#kpiDetIncYear', cfg);

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => ({ value: currentYear - i, label: String(currentYear - i) }));
    detalleChoices.year.setChoices(years, 'value', 'label', true).setChoiceByValue(currentYear);

    const end = moment();
    const start = moment().subtract(1, 'days');

    // @ts-ignore
    if (typeof $ !== 'undefined' && $.fn.daterangepicker) {
        // @ts-ignore
        $('#kpiDetIncFechaRange').daterangepicker({
            locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] },
            startDate: start,
            endDate: end,
            autoUpdateInput: true
        });
    }

    document.getElementById('btnKPIDetIncBuscar')?.addEventListener('click', () => applyDetalleFilters());
    document.getElementById('btnKPIDetIncExcel')?.addEventListener('click', exportDetalle);

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state?.clienteAsignado) {
            detalleChoices.cliente.setChoices([{ value: accessControl.state?.clienteAsignado, label: accessControl.state?.clienteAsignado }], 'value', 'label', true);
            detalleChoices.cliente.setChoiceByValue(accessControl.state?.clienteAsignado);
            detalleChoices.cliente.disable();
            await loadUnidades(accessControl.state?.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            detalleChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiDetIncCliente')?.addEventListener('change', async () => {
                const c = detalleChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    detalleChoices.unidad.clearChoices();
                    detalleChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        applyDetalleFilters();
    } catch (e) {
        console.error('Error setup filters Detalle:', e);
    }
}

async function loadUnidades(cliente: string) {
    detalleChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        detalleChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        detalleChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        detalleChoices.unidad.setChoiceByValue(unidades[0]);
        detalleChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        detalleChoices.unidad.setChoices(arr, 'value', 'label', true);
        detalleChoices.unidad.enable();
    }
}

async function applyDetalleFilters() {
    const cliente = detalleChoices.cliente.getValue(true) || 'Todos';
    const unidad = detalleChoices.unidad.getValue(true) || 'Todas';

    allLoadedRecords = [];
    const tablesWrapper = document.getElementById('detalle-tables-wrapper');
    if (tablesWrapper) tablesWrapper.innerHTML = '';
    const sidebar = document.getElementById('detalle-sidebar-stats');
    if (sidebar) sidebar.innerHTML = '';

    UI.showLoader('Filtrando detalles...', 'Consultando base de datos', 20);
    const year = detalleChoices.year.getValue(true) || new Date().getFullYear();

    // @ts-ignore
    const picker = $('#kpiDetIncFechaRange').data('daterangepicker');

    let startDate: Date;
    let endDate: Date;

    if (picker) {
        startDate = picker.startDate.startOf('day').toDate();
        endDate = picker.endDate.endOf('day').toDate();
    } else {
        startDate = moment(`${year}-01-01`, 'YYYY-MM-DD').startOf('year').toDate();
        endDate = moment(`${year}-12-31`, 'YYYY-MM-DD').endOf('year').toDate();
    }

    try {
        let q = query(collection(db, 'INCIDENCIAS_REGISTRADAS'),
            where('timestamp', '>=', startDate),
            where('timestamp', '<=', endDate),
            limit(PAGE_SIZE)
        );

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state?.clienteAsignado) {
            q = query(q, where('cliente', '==', accessControl.state?.clienteAsignado));
        } else if (cliente !== 'Todos') {
            q = query(q, where('cliente', '==', cliente));
        }

        if (unidad !== 'Todas') {
            q = query(q, where('unidad', '==', unidad));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            UI.toast('No se encontraron registros', 'info');
            UI.hideLoader();
            return;
        }

        snapshot.forEach(doc => {
            allLoadedRecords.push(doc.data());
        });

        // IMPORTANTE: Para que los totales coincidan con Resumen, las métricas (sidebar/chart) 
        // deben basarse en TODOS los registros del rango, no solo en la página actual.
        // Como ya tenemos cachedIncidents en Resumen, aquí haremos lo mismo para consistencia.
        const records = allLoadedRecords;
        const totalIncidentsCount = records.length;

        const tiposMap: Record<string, number> = {};
        const tiposOrder: string[] = [];

        records.forEach(data => {
            const tipo = (data.tipoIncidente || 'Sin especificar').trim();
            if (!tiposMap[tipo]) {
                tiposMap[tipo] = 0;
                tiposOrder.push(tipo);
            }
            tiposMap[tipo]++;
        });

        const tables: Record<string, Map<string, number[]>> = {};
        const monthly: Record<string, number[]> = {};
        tiposOrder.forEach(tipo => {
            tables[tipo] = new Map();
            monthly[tipo] = Array(12).fill(0);
        });

        const detailedRecords: any[] = [];
        for (const data of records) {
            const ts = tsToDate(data.timestamp);
            if (!ts) continue;

            const m = ts.getMonth();
            const tipo = (data.tipoIncidente || 'Sin especificar').trim();

            if (monthly[tipo]) {
                monthly[tipo][m]++;
                const detalle = data.detalleIncidente || 'Sin Detalle';
                if (!tables[tipo].has(detalle)) tables[tipo].set(detalle, Array(12).fill(0));
                tables[tipo].get(detalle)![m]++;
            }

            detailedRecords.push({
                'FECHA': ts.toLocaleDateString('es-PE'),
                'HORA': ts.toLocaleTimeString('es-PE'),
                'CLIENTE': data.cliente || 'N/A',
                'UNIDAD': data.unidad || 'N/A',
                'TIPO DE INCIDENTE': data.tipoIncidente || 'N/A',
                'DETALLE': data.detalleIncidente || 'N/A',
                'SUB CATEGORÍA': data.subCategoria || 'N/A',
                'NIVEL RIESGO': data.Nivelderiesgo || 'N/A',
                'ESTADO': data.estado || 'Pendiente',
                'COMENTARIO': data.comentario || 'Sin comentarios'
            });
        }

        lastDetalleData = {
            monthly,
            tables,
            tiposOrder,
            detailedRecords,
            filters: { cliente, unidad, year, startDate, endDate }
        };

        renderDetalleSidebar(monthly, tiposOrder);
        renderDetalleTables(tables, monthly, tiposOrder);
        drawDetalleAreaChart(monthly, tiposOrder);
        UI.hideLoader();

    } catch (e) {
        console.error('Error load Detalle:', e);
        UI.hideLoader();
    }
}

function sumArray(arr: number[]) {
    return arr.reduce((a, b) => a + b, 0);
}

function renderDetalleSidebar(monthly: Record<string, number[]>, tiposOrder: string[]) {
    const sidebar = document.getElementById('detalle-sidebar-stats');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    tiposOrder.forEach((tipo, idx) => {
        const total = sumArray(monthly[tipo]);
        if (total > 0) {
            const color = COLORS[idx % COLORS.length];
            const card = document.createElement('div');
            card.className = 'card stat-card-mini';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.padding = '12px 16px';
            card.style.borderLeft = `4px solid ${color}`;
            card.style.background = 'var(--card-bg)';
            card.style.borderRadius = 'var(--radius)';
            card.style.boxShadow = 'var(--shadow-sm)';

            card.innerHTML = `
                <div style="font-size: 24px; font-weight: 800; color: ${color}; line-height: 1;">${total}</div>
                <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-top: 4px;">${tipo}</div>
            `;
            sidebar.appendChild(card);
        }
    });

    if (sidebar.innerHTML === '') {
        sidebar.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);"><p>No hay datos</p></div>';
    }
}

function renderDetalleTables(tables: Record<string, Map<string, number[]>>, monthly: Record<string, number[]>, tiposOrder: string[]) {
    const mainContent = document.getElementById('detalle-tables-wrapper');
    if (!mainContent) return;
    mainContent.innerHTML = '';

    const tiposConDatos = tiposOrder.filter(tipo => sumArray(monthly[tipo]) > 0);
    if (tiposConDatos.length === 0) return;

    tiposConDatos.forEach(tipo => {
        const matrix = [...tables[tipo].entries()]
            .map(([label, arr]) => ({ label, monthly: arr, total: sumArray(arr) }))
            .sort((a, b) => b.total - a.total);

        const card = document.createElement('div');
        card.className = 'card card-pad';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '12px';
        card.style.minWidth = '0'; // Prevent grid blowout

        card.innerHTML = `
            <h3 style="font-size: 14px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">${tipo.toUpperCase()}</h3>
            <div class="table-wrap kpi-table-wrap" style="overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius);">
                <table class="kpi-table" style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: rgba(15, 23, 41, 0.5);">
                            <th style="text-align: left; padding: 8px; border-bottom: 2px solid var(--border);">CONCEPTO</th>
                            ${months.map(m => `<th style="text-align: center; padding: 8px; border-bottom: 2px solid var(--border);">${m.toUpperCase()}</th>`).join('')}
                            <th style="text-align: center; padding: 8px; border-bottom: 2px solid var(--border);">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        mainContent.appendChild(card);

        const tbody = card.querySelector('tbody');
        if (tbody) {
            let body = matrix.map(r => `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid var(--border); font-weight: 500;">${r.label}</td>
                    ${r.monthly.map(v => `<td style="text-align: center; padding: 8px; border-bottom: 1px solid var(--border);">${v || 0}</td>`).join('')}
                    <td style="text-align: center; padding: 8px; border-bottom: 1px solid var(--border); font-weight: 700; background: rgba(255,255,255,0.02);">${r.total}</td>
                </tr>
            `).join('');

            const monthlyTotals = months.map((_, i) => {
                const sum = matrix.reduce((a, c) => a + (c.monthly[i] || 0), 0);
                return `<td style="text-align: center; padding: 8px; font-weight: 700; color: var(--text);">${sum}</td>`;
            }).join('');

            const grandTotal = matrix.reduce((a, c) => a + (c.total || 0), 0);

            body += `
                <tr style="background: rgba(15, 23, 41, 0.3);">
                    <td style="padding: 8px; font-weight: 700; color: var(--text);">TOTAL</td>
                    ${monthlyTotals}
                    <td style="text-align: center; padding: 8px; font-weight: 800; color: var(--accent);">${grandTotal}</td>
                </tr>
            `;
            tbody.innerHTML = body;
        }
    });
}

function drawDetalleAreaChart(monthly: Record<string, number[]>, tiposOrder: string[]) {
    const canvas = document.getElementById('chartDetalleInc') as HTMLCanvasElement;
    if (!canvas) return;

    if (detalleChart) detalleChart.destroy();

    const hasData = tiposOrder.some(tipo => sumArray(monthly[tipo]) > 0);
    if (!hasData) {
        detalleChart = new Chart(canvas, {
            type: 'line', data: { labels: months, datasets: [] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
        return;
    }

    const datasets = tiposOrder.map((tipo, idx) => {
        const color = COLORS[idx % COLORS.length];
        const rgbaColor = color.replace('#', '').match(/.{2}/g)?.map(x => parseInt(x, 16)).join(',') || '255,255,255';
        return {
            label: tipo,
            data: monthly[tipo],
            fill: true,
            tension: 0.35,
            pointRadius: 1,
            borderWidth: 2,
            borderColor: color,
            backgroundColor: `rgba(${rgbaColor}, 0.2)`
        };
    });

    detalleChart = new Chart(canvas, {
        type: 'line',
        data: { labels: months, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8' } },
                // @ts-ignore
                datalabels: { display: false }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

async function exportDetalle() {
    if (!lastDetalleData || !lastDetalleData.detailedRecords.length) {
        alert('No hay datos para exportar.');
        return;
    }
    await exportToExcel(
        lastDetalleData.detailedRecords,
        `Incidencias_${new Date().toISOString().split('T')[0]}`,
        ['FECHA', 'HORA', 'CLIENTE', 'UNIDAD', 'TIPO DE INCIDENTE', 'DETALLE', 'SUB CATEGORÍA', 'NIVEL RIESGO', 'ESTADO', 'COMENTARIO']
    );
}
