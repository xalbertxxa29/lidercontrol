import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { accessControl } from '../access-control';
import { getUnidadesByCliente, getAllClientes } from '../utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';
import { UI } from '../ui';

import 'daterangepicker';

let apChoices: any = {};
let apCharts: Record<string, Chart> = {};
let apData: any[] = [];
let apFilters = {
    cliente: '',
    unidad: '',
    tipo: '',
    fechaInicio: '',
    fechaFin: ''
};

export function initAccesoPeatonal(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;

    container.innerHTML = `
    <!-- Filtros -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group">
          <label class="filter-label">Fecha / Rango</label>
          <input type="text" id="kpiAPFecha" class="search-input" />
        </div>
        <div class="filter-group">
          <label class="filter-label">Cliente</label>
          <select id="kpiAPCliente"><option value="Todos">Todos</option></select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Unidad</label>
          <select id="kpiAPUnidad"><option value="Todas">Todas</option></select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Tipo Acceso</label>
          <select id="kpiAPTipo">
            <option value="Todos">Todos</option>
            <option value="VISITA">Visita</option>
            <option value="PROVEEDOR">Proveedor</option>
            <option value="CONTRATISTA">Contratista</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnKPIAPBuscar">Aplicar Filtros</button>
        </div>
      </div>
    </div>

    <!-- Counters -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="ap-stats-row" style="display:flex; justify-content:space-around; text-align:center">
        <div class="ap-stat" style="color:var(--accent)">
           <div class="ap-stat-icon" style="font-size:24px">👥</div><div class="ap-stat-num" id="statAPTotal" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Total</div>
        </div>
        <div class="ap-stat" style="color:var(--success)">
           <div class="ap-stat-icon" style="font-size:24px">👤</div><div class="ap-stat-num" id="statAPVisita" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Visitas</div>
        </div>
        <div class="ap-stat" style="color:var(--warning)">
           <div class="ap-stat-icon" style="font-size:24px">📦</div><div class="ap-stat-num" id="statAPProveedor" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Proveedores</div>
        </div>
        <div class="ap-stat" style="color:var(--info)">
           <div class="ap-stat-icon" style="font-size:24px">👷</div><div class="ap-stat-num" id="statAPContratista" style="font-size:24px; font-weight:bold">0</div><div class="ap-stat-label">Contratistas</div>
        </div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="dashboard-grid grid-3">
       <div class="card chart-card col-span-2"><h4 class="card-title">Acceso por Fecha</h4><div class="chart-wrap" style="height:250px"><canvas id="chartAPFecha"></canvas></div></div>
       <div class="card chart-card"><h4 class="card-title">Categorizado por Estado</h4><div class="chart-wrap" style="height:250px"><canvas id="chartAPEstado"></canvas></div></div>
       <div class="card chart-card col-span-2"><h4 class="card-title">Frecuencia por Día de la Semana</h4>
          <div class="table-wrap" style="border:none;margin-top:16px">
             <table class="heatmap-table" id="tableAPHeatmap" style="width:100%; border-collapse:collapse; font-size:12px">
                <!-- Heatmap generated here -->
             </table>
          </div>
       </div>
       <div class="card chart-card"><h4 class="card-title">Categorizado por Unidad</h4><div class="chart-wrap" style="height:300px"><canvas id="chartAPUnidad"></canvas></div></div>
       <div class="card chart-card col-span-3"><h4 class="card-title">Ranking Empresas Visitantes</h4><div class="chart-wrap" style="height:300px"><canvas id="chartAPEmpresa"></canvas></div></div>
    </div>
  `;

    setupFilters();
}

async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    apChoices.cliente = new Choices('#kpiAPCliente', cfg);
    apChoices.unidad = new Choices('#kpiAPUnidad', cfg);
    apChoices.tipo = new Choices('#kpiAPTipo', cfg);

    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    apFilters.fechaInicio = start.toISOString().split('T')[0];
    apFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiAPFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], firstDay: 1 }
    });

    $('#kpiAPFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        apFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        apFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            apChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            apChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            apChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            apChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiAPCliente')?.addEventListener('change', async () => {
                const c = apChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    apChoices.unidad.clearChoices();
                    apChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPIAPBuscar')?.addEventListener('click', applyFiltersAndFetch);
        setTimeout(applyFiltersAndFetch, 500);
    } catch (e) {
        console.error('Error in AP setup:', e);
    }
}

async function loadUnidades(cliente: string) {
    apChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        apChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        apChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        apChoices.unidad.setChoiceByValue(unidades[0]);
        apChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        apChoices.unidad.setChoices(arr, 'value', 'label', true);
        apChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch() {
    const cliente = apChoices.cliente.getValue(true) || 'Todos';
    const unidad = apChoices.unidad.getValue(true) || 'Todas';
    const tipo = apChoices.tipo.getValue(true) || 'Todos';

    apFilters.cliente = cliente === 'Todos' ? '' : cliente;
    apFilters.unidad = unidad === 'Todas' ? '' : unidad;
    apFilters.tipo = tipo === 'Todos' ? '' : tipo;

    UI.showLoader('Consultando Accesos...', 'Buscando registros', 20);

    try {
        let q = query(collection(db, 'ACCESO_PEATONAL'), limit(3000));

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            q = query(q, where('CLIENTE', '==', accessControl.state.clienteAsignado));
        } else if (apFilters.cliente) {
            q = query(q, where('CLIENTE', '==', apFilters.cliente));
        }

        if (apFilters.unidad) {
            q = query(q, where('UNIDAD', '==', apFilters.unidad));
        }

        const snapshot = await getDocs(q);
        let records: any[] = snapshot.docs.map(doc => {
            const x = doc.data();
            const inStr = `${x.FECHA_INGRESO ?? ''} ${x.HORA_INGRESO ?? ''}`.trim();
            const outStr = `${x.FECHA_SALIDA ?? ''} ${x.HORA_FIN ?? ''}`.trim();

            let ts = null;
            if (inStr) {
                const m = moment(inStr, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']);
                if (m.isValid()) ts = m.toDate();
            }
            if (!ts && outStr) {
                const m = moment(outStr, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']);
                if (m.isValid()) ts = m.toDate();
            }

            return { id: doc.id, ...x, _ts: ts };
        });

        if (apFilters.fechaInicio || apFilters.fechaFin) {
            const start = apFilters.fechaInicio ? moment(apFilters.fechaInicio).startOf('day') : null;
            const end = apFilters.fechaFin ? moment(apFilters.fechaFin).endOf('day') : null;
            records = records.filter(r => {
                if (!r._ts) return false;
                const m = moment(r._ts);
                if (start && m.isBefore(start)) return false;
                if (end && m.isAfter(end)) return false;
                return true;
            });
        }

        if (apFilters.tipo) {
            records = records.filter(r => (r.TIPO_ACCESO || '').toString().toUpperCase() === apFilters.tipo);
        }

        apData = records;
        renderStats();
        drawCharts();
        renderHeatmap();

    } catch (e) {
        console.error('Error in AP fetch:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function renderStats() {
    const total = apData.length;
    const norm = (s: any) => (s || '').toString().toUpperCase().trim();
    const visita = apData.filter(r => norm(r.TIPO_ACCESO) === 'VISITA').length;
    const prov = apData.filter(r => norm(r.TIPO_ACCESO) === 'PROVEEDOR').length;
    const cont = apData.filter(r => norm(r.TIPO_ACCESO) === 'CONTRATISTA').length;

    const elTotal = document.getElementById('statAPTotal');
    const elVisita = document.getElementById('statAPVisita');
    const elProv = document.getElementById('statAPProveedor');
    const elCont = document.getElementById('statAPContratista');

    if (elTotal) elTotal.textContent = total.toLocaleString('es-PE');
    if (elVisita) elVisita.textContent = visita.toLocaleString('es-PE');
    if (elProv) elProv.textContent = prov.toLocaleString('es-PE');
    if (elCont) elCont.textContent = cont.toLocaleString('es-PE');
}

function drawCharts() {
    drawFechaChart();
    drawEstadoChart();
    drawUnidadChart();
    drawEmpresaChart();
}

function drawFechaChart() {
    const ctx = document.getElementById('chartAPFecha') as HTMLCanvasElement;
    if (!ctx) return;
    if (apCharts.fecha) apCharts.fecha.destroy();

    const start = moment(apFilters.fechaInicio);
    const end = moment(apFilters.fechaFin);
    const labels = [];
    const map: Record<string, number> = {};

    for (let m = start.clone(); m.isSameOrBefore(end, 'day'); m.add(1, 'day')) {
        const k = m.format('DD/MM');
        labels.push(k);
        map[k] = 0;
    }

    apData.forEach(r => {
        if (!r._ts) return;
        const k = moment(r._ts).format('DD/MM');
        if (map[k] !== undefined) map[k]++;
    });

    apCharts.fecha = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Accesos', data: labels.map(l => map[l]), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
}

function drawEstadoChart() {
    const ctx = document.getElementById('chartAPEstado') as HTMLCanvasElement;
    if (!ctx) return;
    if (apCharts.estado) apCharts.estado.destroy();

    const counts: Record<string, number> = {};
    apData.forEach(r => { const st = r.ESTADO || 'S/E'; counts[st] = (counts[st] || 0) + 1; });

    apCharts.estado = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444', '#94a3b8'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
}

function drawUnidadChart() {
    const ctx = document.getElementById('chartAPUnidad') as HTMLCanvasElement;
    if (!ctx) return;
    if (apCharts.unidad) apCharts.unidad.destroy();

    const counts: Record<string, number> = {};
    apData.forEach(r => { const u = r.UNIDAD || 'S/U'; counts[u] = (counts[u] || 0) + 1; });

    const labels = Object.keys(counts).sort();
    apCharts.unidad = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Accesos', data: labels.map(l => counts[l]), backgroundColor: '#6366f1' }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', stepSize: 1 } }, y: { ticks: { color: '#94a3b8' } } } }
    });
}

function drawEmpresaChart() {
    const ctx = document.getElementById('chartAPEmpresa') as HTMLCanvasElement;
    if (!ctx) return;
    if (apCharts.empresa) apCharts.empresa.destroy();

    const counts: Record<string, number> = {};
    apData.forEach(r => { const e = r.EMPRESA || 'SIN EMPRESA'; counts[e] = (counts[e] || 0) + 1; });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const labels = sorted.map(x => x[0]);
    const data = sorted.map(x => x[1]);

    apCharts.empresa = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Accesos', data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', stepSize: 1 } }, y: { ticks: { color: '#94a3b8' } } } }
    });
}

function renderHeatmap() {
    const el = document.getElementById('tableAPHeatmap');
    if (!el) return;

    const bins = Array(12).fill(0).map(() => Array(7).fill(0));
    apData.forEach(r => {
        if (!r._ts) return;
        const m = moment(r._ts);
        const slot = Math.floor(m.hour() / 2);
        const dow = m.day();
        if (slot >= 0 && slot < 12 && dow >= 0 && dow < 7) bins[slot][dow]++;
    });

    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    let max = 0; bins.forEach(r => r.forEach(v => max = Math.max(max, v)));

    let html = `<thead><tr><th>Horario</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < 12; i++) {
        const start = `${(i * 2).toString().padStart(2, '0')}:00`;
        const end = `${(i * 2 + 2).toString().padStart(2, '0')}:00`;
        html += `<tr><td style="font-weight:bold; background:rgba(255,255,255,0.05)">${start}-<br>${end}</td>`;
        for (let d = 0; d < 7; d++) {
            const v = bins[i][d];
            const op = max ? v / max : 0;
            const bg = `rgba(14,165,233,${0.1 + 0.7 * op})`;
            html += `<td style="background:${bg}; text-align:center; color:${op > 0.5 ? '#fff' : '#94a3b8'}">${v}</td>`;
        }
        html += `</tr>`;
    }
    html += `</tbody>`;
    el.innerHTML = html;
}
