import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PALETTE, tsToDate, bucketOf, nf, pf, getAllClientes, getUnidadesByCliente } from '../utils';
import { moment, $ } from '../globals';

import 'daterangepicker';

// Register Chart Plugins
Chart.register(ChartDataLabels);

// Chart Instances
const charts: Record<string, Chart | null> = {};

let cachedIncidents: any[] = [];
let summaryData: any = null;

export async function initResumen(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;

    // Si ya tiene contenido, no regenerar todo, solo refrescar si es necesario
    if (!container.innerHTML.trim()) {
        container.innerHTML = `
      <!-- Filtros -->
      <div class="card card-pad" style="margin-bottom: 16px;">
        <div class="filters-bar" style="padding: 0;">
          <div class="filter-group">
            <label class="filter-label">Cliente</label>
            <select id="resumen-filtro-cliente" class="search-input"><option value="Todos">Todos</option></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Unidad</label>
            <select id="resumen-filtro-unidad" class="search-input"><option value="Todas">Todas</option></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Categoría</label>
            <select id="resumen-filtro-categoria" class="search-input"><option value="Todos">Todos</option></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Nivel de Riesgo</label>
            <select id="resumen-filtro-riesgo" class="search-input"><option value="Todos">Todos</option></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Fecha</label>
            <input type="text" id="resumen-filtro-fecha" class="search-input" />
          </div>
          <div class="filter-group" style="padding-bottom: 2px;">
            <button class="btn btn-primary" id="resumen-btn-refresh">Aplicar Filtros</button>
          </div>
          <div class="filter-group" style="padding-bottom: 2px; margin-left: auto;">
             <div class="mini-stat-num" id="resumen-total-incidentes" style="color:var(--accent); text-align:right">0</div>
             <div class="mini-stat-label" style="text-align:right; font-size:10px; color:var(--text-muted)">INCIDENTES REGISTRADOS</div>
          </div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="dashboard-grid grid-3">
        <div class="card chart-card">
          <h4 class="card-title">Q° Incidentes por Nivel de Riesgo</h4>
          <div class="risk-dashboard">
            <div class="risk-chart-area">
              <div class="chart-wrap" style="height:220px; position:relative">
                <canvas id="resumen-chart-riesgo"></canvas>
                <div class="risk-total-center">
                  <span id="risk-total-num" class="risk-total-num">0</span>
                  <span class="risk-total-label">TOTAL</span>
                </div>
              </div>
            </div>
            <div class="risk-bars-area" id="risk-bars-container">
              <!-- JS Injects Progress Bars Here -->
            </div>
          </div>
        </div>
        <div class="card chart-card">
          <h4 class="card-title">Q° Incidentes por Categoría</h4>
          <div class="chart-scroll-x" style="height:260px; overflow-x: auto; overflow-y: hidden; width: 100%; max-width: 100%; position: relative;">
            <div id="resumen-chart-categoria-container" style="height: 100%; display: block;">
              <canvas id="resumen-chart-categoria" style="height: 100% !important;"></canvas>
            </div>
          </div>
        </div>
        <div class="card chart-card">
          <h4 class="card-title">Q° Incidencias Registradas por Mes</h4>
          <div class="chart-wrap" style="height:260px"><canvas id="resumen-chart-mes"></canvas></div>
        </div>
        <div class="card chart-card col-span-2">
          <h4 class="card-title">Q° Incidentes por Unidad</h4>
          <div class="chart-scroll-y" style="height:300px; overflow-y: auto; overflow-x: hidden; width: 100%;">
            <div id="resumen-chart-unidad-container" style="width: 100%; display: block; position: relative;">
              <canvas id="resumen-chart-unidad" style="width: 100% !important; height: 100% !important;"></canvas>
            </div>
          </div>
        </div>
        <div class="card chart-card">
          <h4 class="card-title">Q° de Incidencias por Fecha</h4>
          <div class="chart-wrap" style="height:400px"><canvas id="resumen-chart-fecha"></canvas></div>
        </div>
        <div class="card chart-card col-span-2">
          <h4 class="card-title">Mapa de Calor (Día vs Hora)</h4>
          <div class="table-wrap kpi-table-wrap" style="height:400px; overflow:auto; border:none">
            <table class="kpi-table heatmap-table" id="resumen-tabla-heatmap">
              <thead>
                <tr>
                  <th>HORA</th><th>DOM</th><th>LUN</th><th>MAR</th><th>MIÉ</th><th>JUE</th><th>VIE</th><th>SÁB</th><th>TOTAL</th>
                </tr>
              </thead>
              <tbody id="resumen-heatmap-body"></tbody>
            </table>
          </div>
        </div>
         <div class="card chart-card">
          <h4 class="card-title">Mapa de Sedes</h4>
          <div class="chart-wrap" style="height:400px; padding:0">
            <div id="resumen-map" style="width:100%; height:100%; border-radius:inherit"></div>
          </div>
        </div>
      </div>
    `;

        initDateRange();
        bindEvents();
        await fetchAndRenderData();
    }
}

function initDateRange() {
    // @ts-ignore
    if (typeof $ !== 'undefined' && $.fn.daterangepicker) {
        // @ts-ignore
        $('#resumen-filtro-fecha').daterangepicker({
            locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] },
            startDate: moment().subtract(1, 'days').startOf('day'),
            endDate: moment().endOf('day')
        });
    }
}

function bindEvents() {
    // Re-fetch from Firestore when the user clicks Aplicar (date range may have changed)
    document.getElementById('resumen-btn-refresh')?.addEventListener('click', () => fetchAndRenderData());

    // Al cambiar cliente -> recargar unidades -> limpiar categorías -> filtrar
    document.getElementById('resumen-filtro-cliente')?.addEventListener('change', async () => {
        const clientVal = (document.getElementById('resumen-filtro-cliente') as HTMLSelectElement)?.value || 'Todos';
        await loadResumenUnidades(clientVal);
        const unitVal = (document.getElementById('resumen-filtro-unidad') as HTMLSelectElement)?.value || 'Todas';
        await loadResumenCategorias(clientVal, unitVal);
        applyFiltersAndRender();
    });

    // Al cambiar unidad -> recargar categorías -> filtrar
    document.getElementById('resumen-filtro-unidad')?.addEventListener('change', async () => {
        const clientVal = (document.getElementById('resumen-filtro-cliente') as HTMLSelectElement)?.value || 'Todos';
        const unitVal = (document.getElementById('resumen-filtro-unidad') as HTMLSelectElement)?.value || 'Todas';
        await loadResumenCategorias(clientVal, unitVal);
        applyFiltersAndRender();
    });

    // Client-side filters (no re-fetch needed)
    document.getElementById('resumen-filtro-categoria')?.addEventListener('change', () => applyFiltersAndRender());
    document.getElementById('resumen-filtro-riesgo')?.addEventListener('change', () => applyFiltersAndRender());
}

async function loadResumenCategorias(cliente: string, unidad: string) {
    const selCat = document.getElementById('resumen-filtro-categoria') as HTMLSelectElement;
    if (!selCat) return;

    selCat.innerHTML = '<option value="Todos">Todas las categorías</option>';

    if (cliente === 'Todos' || unidad === 'Todas') {
        // Si no hay cliente/unidad específica, sacar de cachedIncidents
        const cats = [...new Set(cachedIncidents.map(d => d.tipoIncidente).filter(Boolean))].sort();
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            selCat.appendChild(opt);
        });
        return;
    }

    try {
        const q = query(collection(db, 'TIPO_INCIDENCIAS', cliente, 'UNIDADES', unidad, 'TIPO'));
        const snap = await getDocs(q);
        snap.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.id;
            selCat.appendChild(opt);
        });
    } catch (e) {
        console.warn('Error loading dynamic categories:', e);
    }
}

async function loadResumenUnidades(clienteName: string) {
    const selUnidad = document.getElementById('resumen-filtro-unidad') as HTMLSelectElement;
    if (!selUnidad) return;
    selUnidad.innerHTML = '<option value="Todas">Todas las unidades</option>';
    if (!clienteName || clienteName === 'Todos') return;
    const unidades = await getUnidadesByCliente(clienteName);
    unidades.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        selUnidad.appendChild(opt);
    });
}

async function fetchAndRenderData() {
    UI.showLoader('Cargando resumen...', 'Consultando estadísticas e incidencias...', 30);
    try {
        // 1. Intentar cargar el resumen pre-agregado de Cloud Functions
        try {
            const summarySnap = await getDoc(doc(db, 'KPI_SUMMARIES', 'incidents_global'));
            if (summarySnap.exists()) {
                summaryData = summarySnap.data();
                console.log('Summary data loaded from Cloud Functions');
            }
        } catch (e) {
            console.warn('Could not load KPI summary, falling back to raw data:', e);
        }

        // 2. Leer el rango de fechas seleccionado por el usuario
        const fechaStr = (document.getElementById('resumen-filtro-fecha') as HTMLInputElement)?.value;
        let fetchStart: Date | null = null;
        let fetchEnd: Date | null = null;

        if (fechaStr && fechaStr.includes(' - ')) {
            const parts = fechaStr.split(' - ');
            fetchStart = moment(parts[0], 'DD/MM/YYYY').startOf('day').toDate();
            fetchEnd = moment(parts[1], 'DD/MM/YYYY').endOf('day').toDate();
        } else {
            // Por defecto: últimos 2 días
            fetchStart = moment().subtract(1, 'days').startOf('day').toDate();
            fetchEnd = moment().endOf('day').toDate();
        }

        // 3. Fetch desde Firestore usando el rango seleccionado
        let q = query(
            collection(db, 'INCIDENCIAS_REGISTRADAS'),
            where('timestamp', '>=', fetchStart),
            where('timestamp', '<=', fetchEnd),
            limit(5000)
        );
        q = accessControl.applyClienteFilter(q);

        const snap = await getDocs(q);
        cachedIncidents = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp || new Date()),
            };
        });

        await populateFilters(cachedIncidents);
        applyFiltersAndRender();

        // Si hay data de resumen global, usar para el total (todos los tiempos)
        if (summaryData && !(fechaStr && fechaStr.includes(' - '))) {
            const totalEl = document.getElementById('resumen-total-incidentes');
            if (totalEl) totalEl.textContent = summaryData.total.toLocaleString('es-PE');
        }
    } catch (error) {
        console.error('Error fetching resumen:', error);
        UI.toast('Error cargando incidencias', 'error');
    } finally {
        UI.hideLoader();
    }
}

async function populateFilters(data: any[]) {
    // Riesgos: derived from loaded incident data
    const riesgos = [...new Set(data.map((d: any) => d.Nivelderiesgo).filter(Boolean))].sort();

    const selCat = document.getElementById('resumen-filtro-categoria') as HTMLSelectElement;
    const selRiesgo = document.getElementById('resumen-filtro-riesgo') as HTMLSelectElement;
    const selCliente = document.getElementById('resumen-filtro-cliente') as HTMLSelectElement;

    if (selRiesgo) selRiesgo.innerHTML = '<option value="Todos">Todos</option>' + riesgos.map((r: string) => `<option value="${r}">${r}</option>`).join('');

    // Clientes: load from CLIENTE_UNIDAD collection
    if (selCliente) {
        if (accessControl.state?.userType === 'CLIENTE') {
            const c = accessControl.state.clienteAsignado || 'Sin Asignar';
            selCliente.innerHTML = `<option value="${c}">${c}</option>`;
            selCliente.disabled = true;
            // Load units for this fixed client
            await loadResumenUnidades(c);
        } else {
            selCliente.innerHTML = '<option value="Todos">Todos los clientes</option>';
            try {
                const clientes = await getAllClientes();
                clientes.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    selCliente.appendChild(opt);
                });
            } catch (e) {
                console.warn('Could not load clientes:', e);
            }
            // Reset units and categories to "Todas/Todos" when all clients are shown
            const selUnidad = document.getElementById('resumen-filtro-unidad') as HTMLSelectElement;
            if (selUnidad) selUnidad.innerHTML = '<option value="Todas">Todas las unidades</option>';
            await loadResumenCategorias('Todos', 'Todas');
        }
    }
}

function applyFiltersAndRender() {
    const cliente = (document.getElementById('resumen-filtro-cliente') as HTMLInputElement)?.value || 'Todos';
    const unidad = (document.getElementById('resumen-filtro-unidad') as HTMLInputElement)?.value || 'Todas';
    const categoria = (document.getElementById('resumen-filtro-categoria') as HTMLInputElement)?.value || 'Todos';
    const riesgo = (document.getElementById('resumen-filtro-riesgo') as HTMLInputElement)?.value || 'Todos';
    const fechaStr = (document.getElementById('resumen-filtro-fecha') as HTMLInputElement)?.value;

    const hasDateFilter = !!(fechaStr && fechaStr.includes(' - '));
    // Only use pre-aggregated summaryData when truly no filter is active (no dropdowns AND no date range)
    const isGlobal = !hasDateFilter && cliente === 'Todos' && unidad === 'Todas' && categoria === 'Todos' && riesgo === 'Todos';

    if (isGlobal && summaryData) {
        const totalEl = document.getElementById('resumen-total-incidentes');
        if (totalEl) totalEl.textContent = summaryData.total.toLocaleString('es-PE');

        drawRiesgoChart(summaryData.by_risk || {});
        drawCategoriaChart(summaryData.by_category || {});
        drawUnidadChart(summaryData.by_unit || {});
        drawFechaChart(cachedIncidents, moment().subtract(1, 'days').startOf('day'), moment().endOf('day'));
        drawMesChart(cachedIncidents);
        renderHeatmap(cachedIncidents);
        initializeResumenMap(cachedIncidents);
        return;
    }

    let startDate = moment().subtract(1, 'days').startOf('day');
    let endDate = moment().endOf('day');

    if (fechaStr && fechaStr.includes(' - ')) {
        const parts = fechaStr.split(' - ');
        startDate = moment(parts[0], 'DD/MM/YYYY').startOf('day');
        endDate = moment(parts[1], 'DD/MM/YYYY').endOf('day');
    }

    const filtered = cachedIncidents.filter(d => {
        const dVal = moment(d.timestamp);
        const inDate = dVal.isBetween(startDate, endDate, undefined, '[]');
        const inCli = cliente === 'Todos' || d.cliente === cliente;
        const inUni = unidad === 'Todas' || d.unidad === unidad;
        const inCat = categoria === 'Todos' || d.tipoIncidente === categoria;
        const inR = riesgo === 'Todos' || d.Nivelderiesgo === riesgo;
        return inDate && inCli && inUni && inCat && inR;
    });

    const totalEl = document.getElementById('resumen-total-incidentes');
    if (totalEl) totalEl.textContent = filtered.length.toLocaleString('es-PE');

    drawRiesgoChart(filtered);
    drawCategoriaChart(filtered);
    drawUnidadChart(filtered);
    drawFechaChart(filtered, startDate, endDate);
    drawMesChart(filtered);
    renderHeatmap(filtered);
    initializeResumenMap(filtered);
}

function drawChart(canvasId: string, config: any) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    if (charts[canvasId]) {
        charts[canvasId]!.destroy();
    }
    charts[canvasId] = new Chart(canvas, config);
}

function drawRiesgoChart(dataOrCounts: any[] | Record<string, number>) {
    let counts: Record<string, number> = {};
    if (Array.isArray(dataOrCounts)) {
        counts = dataOrCounts.reduce((acc, curr) => {
            const r = curr.Nivelderiesgo || 'No definido';
            acc[r] = (acc[r] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    } else {
        counts = dataOrCounts;
    }

    const riskColors: Record<string, string> = {
        'ALTO': '#ff003c',    // Neon Red
        'MEDIO': '#f59e0b',   // Bright Orange
        'BAJO': '#00f0ff',    // Neon Cyan
        'CRÍTICO': '#991b1b', // Dark Red
        'No definido': '#9ca3af'
    };

    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const colors = labels.map(l => riskColors[l.toUpperCase()] || '#94a3b8');
    const totalCount = values.reduce((a, b) => a + b, 0);

    // 1. Update Center Total Text
    const totalEl = document.getElementById('risk-total-num');
    if (totalEl) totalEl.textContent = totalCount.toLocaleString('es-PE');

    // 2. Draw Clean Doughnut
    drawChart('resumen-chart-riesgo', {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: '#02040a',
                borderWidth: 4,
                hoverOffset: 12,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            layout: { padding: 5 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context: any) {
                            const val = context.raw || 0;
                            const perc = totalCount ? ((val / totalCount) * 100).toFixed(0) : '0';
                            return ` ${context.label}: ${val} (${perc}%)`;
                        }
                    }
                },
                datalabels: { display: false } // Hidden text inside slice
            }
        }
    });

    // 3. Render Custom Linear Progress Bars
    const barsContainer = document.getElementById('risk-bars-container');
    if (!barsContainer) return;

    if (totalCount === 0) {
        barsContainer.innerHTML = '<div class="muted" style="text-align:center; padding: 20px 0;">No hay incidencias</div>';
        return;
    }

    let barsHtml = '';
    // Sort logic to match visual (Alto -> Medio -> Bajo) visually if desired, or simple map:
    labels.forEach((label, idx) => {
        const val = values[idx];
        const color = colors[idx];
        const percentage = totalCount ? Math.round((val / totalCount) * 100) : 0;

        barsHtml += `
            <div class="risk-bar-item">
                <div class="risk-bar-header">
                    <div class="risk-bar-label">
                        <div class="risk-dot" style="background:${color}; box-shadow: 0 0 8px ${color}"></div>
                        ${label}
                    </div>
                    <div class="risk-bar-perc">${percentage}%</div>
                </div>
                <div class="risk-bar-track">
                    <div class="risk-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
                </div>
            </div>
        `;
    });

    barsContainer.innerHTML = barsHtml;
}


function drawCategoriaChart(dataOrCounts: any[] | Record<string, number>) {
    let counts: Record<string, number> = {};
    if (Array.isArray(dataOrCounts)) {
        counts = dataOrCounts.reduce((acc, curr) => {
            // Usar el campo tipoIncidente real para el gráfico de barras
            const c = curr.tipoIncidente || 'Sin Categoría';
            acc[c] = (acc[c] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    } else {
        counts = dataOrCounts;
    }

    const sortedPairs = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const labels = sortedPairs.map(p => p[0]);
    const values = sortedPairs.map(p => p[1]);

    // Calcular ancho dinámico (min 60px por barra para asegurar el scroll)
    const container = document.getElementById('resumen-chart-categoria-container');
    if (container) {
        const parentWidth = container.parentElement?.clientWidth || 250;
        const dynamicWidth = Math.max(parentWidth, labels.length * 60);
        container.style.width = dynamicWidth + 'px';
    }

    drawChart('resumen-chart-categoria', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: '#3b82f6',
                borderRadius: 4,
                barThickness: 30
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'top', color: '#94a3b8', font: { size: 10 } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 9 }, maxRotation: 90, minRotation: 90 }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function drawUnidadChart(dataOrCounts: any[] | Record<string, number>) {
    let counts: Record<string, number> = {};
    if (Array.isArray(dataOrCounts)) {
        counts = dataOrCounts.reduce((acc, curr) => {
            const u = curr.unidad || 'Sin Unidad';
            acc[u] = (acc[u] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    } else {
        counts = dataOrCounts;
    }

    const sortedPairs = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const labels = sortedPairs.map(p => p[0]);
    const values = sortedPairs.map(p => p[1]);

    // Calcular altura dinámica (min 35px por fila)
    const container = document.getElementById('resumen-chart-unidad-container');
    if (container) {
        const dynamicHeight = Math.max(container.parentElement?.clientHeight || 300, labels.length * 35);
        container.style.height = dynamicHeight + 'px';
    }

    drawChart('resumen-chart-unidad', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: '#eab308',
                borderRadius: 4,
                barThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'right', color: '#94a3b8', font: { size: 10 } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function drawFechaChart(data: any[], start: moment.Moment, end: moment.Moment) {
    const counts: Record<string, number> = {};
    let curr = start.clone();
    while (curr.isSameOrBefore(end)) {
        counts[curr.format('DD/MM')] = 0;
        curr.add(1, 'days');
    }

    data.forEach(d => {
        const k = moment(d.timestamp).format('DD/MM');
        if (counts[k] !== undefined) counts[k]++;
    });

    drawChart('resumen-chart-fecha', {
        type: 'line',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#a855f7',
                pointRadius: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: (ctx: any) => ctx.dataset.data[ctx.dataIndex] > 0,
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    color: '#a855f7',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v: any) => v
                }
            },
            scales: {
                x: { ticks: { color: '#94a3b8', maxTicksLimit: 15 }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function drawMesChart(data: any[]) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const counts = Array(12).fill(0);

    data.forEach(d => {
        counts[moment(d.timestamp).month()]++;
    });

    drawChart('resumen-chart-mes', {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                data: counts,
                backgroundColor: '#14b8a6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'top', color: '#94a3b8', font: { size: 10 } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderHeatmap(data: any[]) {
    const heatmap = Array(24).fill(0).map(() => Array(7).fill(0));
    data.forEach((d) => {
        const ts = moment(d.timestamp);
        const hour = ts.hour();
        const day = ts.day(); // 0=Domingo, 6=Sábado
        heatmap[hour][day]++;
    });

    const tbody = document.getElementById('resumen-heatmap-body');
    if (!tbody) return;

    const cellStyle = 'padding:6px; font-size:0.8rem; text-align:center; border:1px solid rgba(255,255,255,0.1);';
    const labelStyle = 'background:rgba(255,255,255,0.02); color:var(--text-muted); font-weight:600; padding:6px; font-size:0.75rem; border:1px solid rgba(255,255,255,0.1); text-align:center; min-width:80px;';
    const totalStyle = 'background:rgba(255,255,255,0.05); font-weight:bold; color:var(--text); padding:6px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.1); text-align:center;';

    let html = '';
    const colTotals = Array(7).fill(0);
    let maxCell = 0;

    for (let h = 0; h < 24; h++) {
        for (let d = 0; d < 7; d++) {
            maxCell = Math.max(maxCell, heatmap[h][d]);
        }
    }

    for (let h = 0; h < 24; h++) {
        const hourLabel = `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`;
        let rowTotal = 0;
        let rowHtml = `<tr><td style="${labelStyle}">${hourLabel}</td>`;

        for (let d = 0; d < 7; d++) {
            const val = heatmap[h][d];
            colTotals[d] += val;
            rowTotal += val;

            let bg = 'transparent';
            let color = 'var(--text-muted)';
            let fw = 'normal';

            if (val > 0) {
                const k = maxCell ? val / maxCell : 0;
                if (k < 0.2) { bg = '#1e3a8a'; color = '#93c5fd'; }
                else if (k < 0.4) { bg = '#1d4ed8'; color = '#bfdbfe'; }
                else if (k < 0.6) { bg = '#f59e0b'; color = '#fef3c7'; }
                else if (k < 0.8) { bg = '#ea580c'; color = '#ffedd5'; }
                else { bg = '#ef4444'; color = '#fee2e2'; }
                fw = 'bold';
            }

            rowHtml += `<td style="${cellStyle}; background-color:${bg}; color:${color}; font-weight:${fw}">${val > 0 ? val : ''}</td>`;
        }
        rowHtml += `<td style="${totalStyle}">${rowTotal}</td></tr>`;
        html += rowHtml;
    }

    const grandTotal = colTotals.reduce((a, b) => a + b, 0);
    html += `<tr>
    <td style="${labelStyle}">TOTAL</td>
    ${colTotals.map(t => `<td style="${totalStyle}">${t}</td>`).join('')}
    <td style="${totalStyle}">${grandTotal}</td>
  </tr>`;

    tbody.innerHTML = html;
}

let resumenMap: L.Map | null = null;
const LOCATION_COORDS: Record<string, { lat: number, lng: number }> = {
    // DEPARTAMENTOS / CIUDADES PRINCIPALES
    'AMAZONAS': { lat: -6.2317, lng: -77.8690 },
    'ANCASH': { lat: -9.5278, lng: -77.5278 },
    'HUARAZ': { lat: -9.5290, lng: -77.5284 },
    'CHIMBOTE': { lat: -9.0760, lng: -78.5737 },
    'APURIMAC': { lat: -13.6339, lng: -72.8814 },
    'ABANCAY': { lat: -13.6339, lng: -72.8814 },
    'AREQUIPA': { lat: -16.3989, lng: -71.5350 },
    'AYACUCHO': { lat: -13.1631, lng: -74.2237 },
    'CAJAMARCA': { lat: -7.1632, lng: -78.5003 },
    'CALLAO': { lat: -12.0560, lng: -77.1260 },
    'CUSCO': { lat: -13.5320, lng: -71.9675 },
    'CUZCO': { lat: -13.5320, lng: -71.9675 },
    'HUANCAVELICA': { lat: -12.7861, lng: -74.9760 },
    'HUANUCO': { lat: -9.9306, lng: -76.2422 },
    'ICA': { lat: -14.0678, lng: -75.7286 },
    'CHINCHA': { lat: -13.4194, lng: -76.1345 },
    'PISCO': { lat: -13.7259, lng: -76.1856 },
    'NAZCA': { lat: -14.8294, lng: -74.9431 },
    'JUNIN': { lat: -11.1582, lng: -75.9933 },
    'HUANCAYO': { lat: -12.0651, lng: -75.2049 },
    'LA LIBERTAD': { lat: -8.1116, lng: -79.0266 },
    'TRUJILLO': { lat: -8.1116, lng: -79.0266 },
    // ZONAS DE LIMA
    'MIRAFLORES': { lat: -12.1111, lng: -77.0316 },
    'SAN ISIDRO': { lat: -12.0970, lng: -77.0360 },
    'SURCO': { lat: -12.1388, lng: -76.9953 },
    'LA MOLINA': { lat: -12.0833, lng: -76.9366 },
    'SAN BORJA': { lat: -12.1009, lng: -76.9996 },
    'ATE': { lat: -12.0255, lng: -76.9142 },
};

function getCoordinatesFromUnitName(unitName: string) {
    if (!unitName) return null;
    const normalized = unitName.toUpperCase().trim();
    const keys = Object.keys(LOCATION_COORDS).sort((a, b) => b.length - a.length);

    for (const key of keys) {
        if (normalized.includes(key)) {
            const base = LOCATION_COORDS[key];
            return {
                lat: base.lat + (Math.random() - 0.5) * 0.005,
                lng: base.lng + (Math.random() - 0.5) * 0.005
            };
        }
    }
    return null;
}

function initializeResumenMap(data: any[]) {
    const mapElement = document.getElementById('resumen-map');
    if (!mapElement) return;

    if (resumenMap) {
        resumenMap.remove();
        resumenMap = null;
    }

    resumenMap = L.map('resumen-map', {
        center: [-12.0464, -77.0428],
        zoom: 5,
        zoomControl: false,
        attributionControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(resumenMap);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        className: 'neo-green-map'
    }).addTo(resumenMap);

    const locationCounts: Record<string, any> = {};
    data.forEach(d => {
        const location = d.unidad || 'Ubicación Desconocida';
        if (!locationCounts[location]) {
            const smartCoords = getCoordinatesFromUnitName(location);
            if (smartCoords) {
                locationCounts[location] = { count: 0, lat: smartCoords.lat, lng: smartCoords.lng, isReal: true };
            } else {
                const baseLat = -12.0464;
                const baseLng = -77.0428;
                locationCounts[location] = {
                    count: 0,
                    lat: baseLat + (Math.random() - 0.5) * 0.1,
                    lng: baseLng + (Math.random() - 0.5) * 0.1,
                    isReal: false
                };
            }
        }
        locationCounts[location].count++;
    });

    const bounds = L.latLngBounds([[-12.0464, -77.0428], [-12.0464, -77.0428]]);
    let hasRealLocations = false;

    Object.entries(locationCounts).forEach(([location, info]) => {
        const { count, lat, lng, isReal } = info;
        if (isReal) hasRealLocations = true;

        const size = Math.min(Math.max(30, count * 2), 60);
        const color = count > 10 ? '#ef4444' : count > 3 ? '#f59e0b' : '#3b82f6';

        const customIcon = L.divIcon({
            className: 'custom-map-marker',
            html: `<div style="
        background-color: ${color};
        width: ${size}px; height: ${size}px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.8);
        box-shadow: 0 0 15px ${color};
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: bold; font-size: 12px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      ">${count}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        L.marker([lat, lng], { icon: customIcon })
            .addTo(resumenMap!)
            .bindPopup(`
        <div style="text-align:center; padding:5px;">
          <h4 style="margin:0 0 5px 0; color:#1e293b;">${location}</h4>
          <span style="font-size:12px; color:#64748b;">Incidentes: <strong>${count}</strong></span>
          ${!isReal ? '<br><small style="color:#94a3b8; font-style:italic;">(Ubicación no detectada)</small>' : ''}
        </div>
      `);

        bounds.extend([lat, lng]);
    });

    if (Object.keys(locationCounts).length > 0) {
        if (hasRealLocations) {
            resumenMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
        } else {
            resumenMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
        }
    }
}
