import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy, startAfter } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import { getUnidadesByCliente, getAllClientes, exportToExcel } from '../utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';

import 'daterangepicker';

let daChoices: any = {};
let daCharts: Record<string, Chart> = {};
let daData: any[] = [];
let lastVisibleDoc: any = null;
let allLoadedDocs: any[] = [];
const PAGE_SIZE = 50;
let daFilters = { cliente: '', unidad: '', tipo: '', estado: '', fechaInicio: '', fechaFin: '' };

export function initDetalleAcceso(tabId: string) {
    const container = document.getElementById(tabId);
    if (!container) return;
    if (container.innerHTML.trim() !== '') return;

    container.innerHTML = `
    <!-- Filtros -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group"><label class="filter-label">Fecha / Rango</label><input type="text" id="kpiDetAccFecha" class="search-input" /></div>
        <div class="filter-group"><label class="filter-label">Cliente</label><select id="kpiDetAccCliente"><option value="Todos">Todos</option></select></div>
        <div class="filter-group"><label class="filter-label">Unidad</label><select id="kpiDetAccUnidad"><option value="Todas">Todas</option></select></div>
        <div class="filter-group"><label class="filter-label">Tipo Acceso</label><select id="kpiDetAccTipo">
            <option value="Todos">Todos</option>
            <option value="VISITA">Visita</option>
            <option value="PROVEEDOR">Proveedor</option>
            <option value="CONTRATISTA">Contratista</option>
            <option value="EMPLEADO">Empleado</option>
        </select></div>
        <div class="filter-group"><label class="filter-label">Estado</label><select id="kpiDetAccEstado">
            <option value="Todos">Todos</option>
            <option value="INGRESADO">INGRESADO</option>
            <option value="FINALIZADO">FINALIZADO</option>
            <option value="OBSERVADO">OBSERVADO</option>
        </select></div>
        <div class="filter-group" style="padding-bottom:2px"><button class="btn btn-primary" id="btnKPIDetAccBuscar">Aplicar</button></div>
        <div class="filter-group" style="padding-bottom:2px;margin-left:auto"><button class="btn btn-success" id="btnKPIDetAccExcel">Exportar Excel</button></div>
      </div>
    </div>

    <!-- 4 Cards Stat -->
    <div class="dashboard-grid grid-4" style="margin-bottom:16px">
      <div class="card card-pad" style="border-left:4px solid #3b82f6">
        <div class="mini-stat-num" id="kpiDATotalNum" style="font-size:24px; font-weight:bold; color:#3b82f6;">0</div>
        <div class="mini-stat-label">Total Accesos</div>
      </div>
      <div class="card card-pad" style="border-left:4px solid #ef4444">
        <div class="mini-stat-num" id="kpiDAProcesoNum" style="font-size:24px; font-weight:bold; color:#ef4444;">0</div>
        <div class="mini-stat-label">En Proceso</div>
      </div>
      <div class="card card-pad" style="border-left:4px solid #10b981">
        <div class="mini-stat-num" id="kpiDAFinalizadoNum" style="font-size:24px; font-weight:bold; color:#10b981;">0</div>
        <div class="mini-stat-label">Finalizado</div>
      </div>
      <div class="card card-pad" style="border-left:4px solid #f59e0b">
        <div class="mini-stat-num" id="kpiDAObservadoNum" style="font-size:24px; font-weight:bold; color:#f59e0b;">0</div>
        <div class="mini-stat-label">Observado</div>
      </div>
    </div>

    <!-- Main Chart: Acceso por Fecha -->
    <div class="card chart-card" style="margin-bottom:20px; padding:16px;">
      <h4 class="card-title">Accesos por Fecha</h4>
      <div class="chart-wrap" style="height:280px"><canvas id="chartDAccFecha"></canvas></div>
    </div>

    <!-- Bottom Charts: Tipo, Empresa, Estado -->
    <div class="dashboard-grid grid-3" style="margin-bottom:20px">
      <div class="card chart-card"><h4 class="card-title">Distribución por Tipo</h4><div class="chart-wrap" style="height:250px"><canvas id="chartDAccTipo"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Top Clientes</h4><div class="chart-wrap" style="height:250px"><canvas id="chartDAccEmpresa"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Estado de Accesos</h4><div class="chart-wrap" style="height:250px"><canvas id="chartDAccEstado"></canvas></div></div>
    </div>

    <!-- Tables Wrapper -->
    <div id="da-tables-wrapper" class="card card-pad" style="margin-top: 24px;">
      <h3 style="margin-bottom: 16px; font-size: 14px; color: var(--accent);">Detalle de Accesos</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ingreso</th>
              <th>Salida</th>
              <th>Durac.</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Nombre</th>
              <th>Empresa</th>
              <th>Destino</th>
              <th>Tipo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody id="da-tbody">
            <tr><td colspan="10" style="text-align:center;padding:30px">Sin datos</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div id="da-load-more-container" style="display:none; justify-content:center; margin-top:20px; padding-bottom:40px;">
      <button id="btnKPIDetAccLoadMore" class="btn btn-secondary">Cargar más registros</button>
    </div>

  `;

    setupFilters();
    document.getElementById('btnKPIDetAccLoadMore')?.addEventListener('click', () => {
        applyFiltersAndFetch(true);
    });
}

async function setupFilters() {
    const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
    daChoices.cliente = new Choices('#kpiDetAccCliente', cfg);
    daChoices.unidad = new Choices('#kpiDetAccUnidad', cfg);
    daChoices.tipo = new Choices('#kpiDetAccTipo', cfg);
    daChoices.estado = new Choices('#kpiDetAccEstado', cfg);

    const end = new Date();
    const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
    daFilters.fechaInicio = start.toISOString().split('T')[0];
    daFilters.fechaFin = end.toISOString().split('T')[0];

    ($('#kpiDetAccFecha') as any).daterangepicker({
        startDate: start,
        endDate: end,
        locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], firstDay: 1 }
    });

    $('#kpiDetAccFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
        daFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
        daFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
    });

    try {
        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            daChoices.cliente.setChoices([{ value: accessControl.state.clienteAsignado, label: accessControl.state.clienteAsignado }], 'value', 'label', true);
            daChoices.cliente.setChoiceByValue(accessControl.state.clienteAsignado);
            daChoices.cliente.disable();
            await loadUnidades(accessControl.state.clienteAsignado);
        } else {
            const clientes = await getAllClientes();
            const choices = [{ value: 'Todos', label: 'Todos los clientes' }].concat(clientes.map(c => ({ value: c, label: c })));
            daChoices.cliente.setChoices(choices, 'value', 'label', true);

            document.getElementById('kpiDetAccCliente')?.addEventListener('change', async () => {
                const c = daChoices.cliente.getValue(true);
                if (c && c !== 'Todos') {
                    await loadUnidades(c);
                } else {
                    daChoices.unidad.clearChoices();
                    daChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
                }
            });
            await loadUnidades('Todos');
        }

        document.getElementById('btnKPIDetAccBuscar')?.addEventListener('click', () => applyFiltersAndFetch(false));
        document.getElementById('btnKPIDetAccExcel')?.addEventListener('click', exportToExcelFile);
        setTimeout(() => applyFiltersAndFetch(false), 500);
    } catch (e) {
        console.error('Error in DA setup:', e);
    }
}

async function loadUnidades(cliente: string) {
    daChoices.unidad.clearChoices();
    if (cliente === 'Todos' || !cliente) {
        daChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades' }], 'value', 'label', true);
        return;
    }

    const unidades = await getUnidadesByCliente(cliente);
    if (accessControl.state?.userType === 'CLIENTE' && unidades.length === 1) {
        daChoices.unidad.setChoices([{ value: unidades[0], label: unidades[0] }], 'value', 'label', true);
        daChoices.unidad.setChoiceByValue(unidades[0]);
        daChoices.unidad.disable();
    } else {
        const arr = [{ value: 'Todas', label: 'Todas las unidades' }].concat(unidades.map(u => ({ value: u, label: u })));
        daChoices.unidad.setChoices(arr, 'value', 'label', true);
        daChoices.unidad.enable();
    }
}

async function applyFiltersAndFetch(isLoadMore = false) {
    const cliente = daChoices.cliente.getValue(true) || 'Todos';
    const unidad = daChoices.unidad.getValue(true) || 'Todas';
    const tipo = daChoices.tipo.getValue(true) || 'Todos';
    const estado = daChoices.estado.getValue(true) || 'Todos';

    if (!isLoadMore) {
        lastVisibleDoc = null;
        allLoadedDocs = [];
        const tbody = document.getElementById('da-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px">Cargando...</td></tr>';
    }

    UI.showLoader(isLoadMore ? 'Cargando más...' : 'Filtrando accesos...', 'Consultando base de datos', 20);
    daFilters.cliente = cliente === 'Todos' ? '' : cliente;
    daFilters.unidad = unidad === 'Todas' ? '' : unidad;
    daFilters.tipo = tipo === 'Todos' ? '' : tipo;
    daFilters.estado = estado === 'Todos' ? '' : estado;

    try {
        let q = query(collection(db, 'ACCESO_PEATONAL'), orderBy('FECHA_INGRESO', 'desc'), limit(PAGE_SIZE));

        if (lastVisibleDoc && isLoadMore) {
            q = query(q, startAfter(lastVisibleDoc));
        }

        if (accessControl.state?.userType === 'CLIENTE' && accessControl.state.clienteAsignado) {
            q = query(q, where('CLIENTE', '==', accessControl.state.clienteAsignado));
        } else if (daFilters.cliente) {
            q = query(q, where('CLIENTE', '==', daFilters.cliente));
        }

        if (daFilters.unidad) {
            q = query(q, where('UNIDAD', '==', daFilters.unidad));
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            UI.toast(isLoadMore ? 'No hay más registros' : 'No se encontraron accesos', 'info');
            document.getElementById('da-load-more-container')!.style.display = 'none';
            if (!isLoadMore) UI.hideLoader();
            return;
        }

        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        document.getElementById('da-load-more-container')!.style.display = snapshot.docs.length < PAGE_SIZE ? 'none' : 'flex';

        const newRecords = snapshot.docs.map(doc => {
            const x = doc.data();
            const inStr = `${x.FECHA_INGRESO ?? ''} ${x.HORA_INGRESO ?? ''}`.trim();
            const outStr = `${x.FECHA_SALIDA ?? ''} ${x.HORA_FIN ?? ''}`.trim();

            let tsIn = null, tsOut = null;
            if (inStr) {
                const m = moment(inStr, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']);
                if (m.isValid()) tsIn = m.toDate();
            }
            if (outStr) {
                const m = moment(outStr, ['DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']);
                if (m.isValid()) tsOut = m.toDate();
            }

            let duracion = 'N/A';
            if (tsIn && tsOut) {
                const diff = moment(tsOut).diff(moment(tsIn), 'minutes');
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                duracion = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }

            return { id: doc.id, ...x, _ts: tsIn || tsOut || null, duracion };
        });

        newRecords.forEach(r => allLoadedDocs.push(r));

        let filtered = allLoadedDocs;
        if (daFilters.fechaInicio || daFilters.fechaFin) {
            const start = daFilters.fechaInicio ? moment(daFilters.fechaInicio).startOf('day') : null;
            const end = daFilters.fechaFin ? moment(daFilters.fechaFin).endOf('day') : null;
            filtered = filtered.filter(r => {
                if (!r._ts) return false;
                const m = moment(r._ts);
                if (start && m.isBefore(start)) return false;
                if (end && m.isAfter(end)) return false;
                return true;
            });
        }

        if (daFilters.tipo) {
            filtered = filtered.filter(r => (r.TIPO_ACCESO || '').toString().toUpperCase() === daFilters.tipo);
        }

        if (daFilters.estado) {
            filtered = filtered.filter(r => (r.ESTADO || '').toString().toUpperCase() === daFilters.estado);
        }

        daData = filtered;
        drawCharts();
        renderTable();

        const totalEl = document.getElementById('kpiDATotalNum');

        let proc = 0, fin = 0, obs = 0;
        daData.forEach(r => {
            const st = (r.ESTADO || '').toUpperCase();
            if (st === 'INGRESADO') proc++;
            else if (st === 'FINALIZADO') fin++;
            else if (st === 'OBSERVADO') obs++;
        });

        const elProc = document.getElementById('kpiDAProcesoNum');
        if (elProc) elProc.textContent = proc.toLocaleString('es-PE');
        const elFin = document.getElementById('kpiDAFinalizadoNum');
        if (elFin) elFin.textContent = fin.toLocaleString('es-PE');
        const elObs = document.getElementById('kpiDAObservadoNum');
        if (elObs) elObs.textContent = obs.toLocaleString('es-PE');

        if (totalEl) totalEl.textContent = daData.length.toLocaleString('es-PE');

    } catch (e) {
        console.error('Error in DA fetch:', e);
        UI.toast('Error al cargar datos', 'error');
    } finally {
        UI.hideLoader();
    }
}

function drawCharts() {
    drawFechaChart();
    drawTipoChart();
    drawEstadoChart();
    drawEmpresaChart();
}

function drawFechaChart() {
    const ctx = document.getElementById('chartDAccFecha') as HTMLCanvasElement;
    if (!ctx) return;
    if (daCharts.fecha) daCharts.fecha.destroy();

    const start = moment(daFilters.fechaInicio);
    const end = moment(daFilters.fechaFin);
    const labels = [];
    const map: Record<string, number> = {};

    for (let m = start.clone(); m.isSameOrBefore(end, 'day'); m.add(1, 'day')) {
        const k = m.format('DD/MM');
        labels.push(k);
        map[k] = 0;
    }

    daData.forEach(r => {
        if (!r._ts) return;
        const k = moment(r._ts).format('DD/MM');
        if (map[k] !== undefined) map[k]++;
    });

    daCharts.fecha = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Accesos', data: labels.map(l => map[l]), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } } }
    });
}

function drawTipoChart() {
    const ctx = document.getElementById('chartDAccTipo') as HTMLCanvasElement;
    if (!ctx) return;
    if (daCharts.tipo) daCharts.tipo.destroy();

    const counts: Record<string, number> = {};
    daData.forEach(r => { const t = r.TIPO_ACCESO || 'S/T'; counts[t] = (counts[t] || 0) + 1; });

    daCharts.tipo = new Chart(ctx, {
        type: 'pie',
        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
}

function drawEstadoChart() {
    const ctx = document.getElementById('chartDAccEstado') as HTMLCanvasElement;
    if (!ctx) return;
    if (daCharts.estado) daCharts.estado.destroy();

    const counts: Record<string, number> = {};
    daData.forEach(r => { const st = r.ESTADO || 'S/E'; counts[st] = (counts[st] || 0) + 1; });

    daCharts.estado = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#10b981', '#f59e0b', '#ef4444'] }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
}

function drawEmpresaChart() {
    const ctx = document.getElementById('chartDAccEmpresa') as HTMLCanvasElement;
    if (!ctx) return;
    if (daCharts.empresa) daCharts.empresa.destroy();

    const counts: Record<string, number> = {};
    daData.forEach(r => { const e = r.EMPRESA || 'SIN EMPRESA'; counts[e] = (counts[e] || 0) + 1; });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(x => x[0]);
    const data = sorted.map(x => x[1]);

    daCharts.empresa = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Accesos', data, backgroundColor: '#8b5cf6', borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', stepSize: 1 } }, y: { ticks: { color: '#94a3b8' } } } }
    });
}

function renderTable() {
    const tbody = document.getElementById('da-tbody');
    if (!tbody) return;

    if (daData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px">Sin resultados</td></tr>';
        return;
    }

    let html = '';
    daData.slice(0, 500).forEach(r => {
        const fh = `${r.FECHA_INGRESO || ''} ${r.HORA_INGRESO || ''}`.trim();
        const visitor = `${r.NOMBRES || ''} ${r.APELLIDOS || ''}`.trim() || r.NOMBRE_PERSONA || '-';

        let stColor = '#94a3b8';
        const st = (r.ESTADO || '').toString().toUpperCase();
        if (st === 'INGRESADO') stColor = '#3b82f6';
        else if (st === 'FINALIZADO') stColor = '#10b981';
        else if (st === 'OBSERVADO') stColor = '#ef4444';

        html += `<tr>
            <td>${fh}</td>
            <td>${r.USUARIO || '-'}</td>
            <td>${r.CLIENTE || '-'}</td>
            <td>${r.UNIDAD || '-'}</td>
            <td>${r.DNI || r.DOCUMENTO || '-'}</td>
            <td>${visitor}</td>
            <td>${r.EMPRESA || '-'}</td>
            <td>${r.TIPO_ACCESO || '-'}</td>
            <td style="text-align:center"><span style="background:${stColor};color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold">${st}</span></td>
            <td>${r.duracion || '-'}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function exportToExcelFile() {
    if (!daData.length) {
        alert('No hay datos para exportar.');
        return;
    }
    const data = daData.map(r => ({
        'FH INGRESO': `${r.FECHA_INGRESO || ''} ${r.HORA_INGRESO || ''}`.trim(),
        'VIGILANTE': r.USUARIO || '-',
        'CLIENTE': r.CLIENTE || '-',
        'UNIDAD': r.UNIDAD || '-',
        'DOC': r.DNI || r.DOCUMENTO || '-',
        'SITANTE': `${r.NOMBRES || ''} ${r.APELLIDOS || ''}`.trim() || r.NOMBRE_PERSONA || '-',
        'MPRESA': r.EMPRESA || '-',
        'TIPO': r.TIPO_ACCESO || '-',
        'ESTADO': r.ESTADO || 'N/A',
        'DURACION': r.duracion || '-'
    }));

    await exportToExcel(data, `DetalleAcceso_${new Date().toISOString().split('T')[0]}`,
        ['FH INGRESO', 'VIGILANTE', 'CLIENTE', 'UNIDAD', 'DOC', 'SITANTE', 'MPRESA', 'TIPO', 'ESTADO', 'DURACION']
    );
}
