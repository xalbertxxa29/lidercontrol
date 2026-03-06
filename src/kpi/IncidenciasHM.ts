import { db } from '../firebase';
import { collection, query, where, getDocs, limit, startAfter } from 'firebase/firestore';
import { UI } from '../ui';
import { accessControl } from '../access-control';
import { exportToExcel, tsToDate } from '../utils';
import { getLogoBase64, generateChartImage, exportToPDF } from '../pdf-utils';
import Choices from 'choices.js';
import Chart from 'chart.js/auto';
import { moment, $ } from '../globals';

import 'daterangepicker';

let hmChoices: any = {};
let hmCharts: Record<string, Chart> = {};
let hmData: any[] = [];
let lastVisibleDoc: any = null;
let allLoadedDocs: any[] = [];
const PAGE_SIZE = 5000;
let hmCurrentPage = 1;
const ITEMS_PER_PAGE = 10;
let hmFilters = {
  unidad: '',
  fechaInicio: '',
  fechaFin: ''
};

export async function initIncidenciasHM(tabId: string) {
  const container = document.getElementById(tabId);
  if (!container) return;

  const isHm = accessControl.state?.userType === 'ADMIN' ||
    accessControl.state?.userType === 'SUPERVISOR' ||
    (accessControl.state?.userType === 'CLIENTE' &&
      ['HM', 'H&M'].includes((accessControl.state.clienteAsignado || '').toUpperCase()));

  if (!isHm) {
    container.innerHTML = '<div class="card card-pad" style="text-align:center;padding:50px"><h3>Acceso Restringido</h3><p>Solo personal autorizado puede ver este dashboard.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="filters-bar" style="padding:0">
        <div class="filter-group">
          <label class="filter-label">Fecha / Rango</label>
          <input type="text" id="kpiHMFecha" class="search-input" />
        </div>
        <div class="filter-group">
          <label class="filter-label">Unidad</label>
          <select id="kpiHMUnidad"><option value="Todas">Todas las unidades</option></select>
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnKPIHMBuscar">Filtrar Base H&M</button>
        </div>
        <div class="filter-group" style="padding-bottom:2px; margin-left:auto; display:flex; gap:8px">
          <button class="btn btn-success" id="btnKPIHMExcel">Excel</button>
          <button class="btn btn-danger" id="btnKPIHMPDF" style="background-color:#ef4444; border-color:#ef4444;">PDF</button>
        </div>
      </div>
    </div>

    <div class="dashboard-grid grid-3" style="margin-bottom:16px">
      <div class="card card-pad" style="border-left:4px solid var(--accent)">
        <div class="mini-stat-num" id="statHMCantidad" style="font-size:24px; font-weight:bold">0</div>
        <div class="mini-stat-label">Cant. Incidencias</div>
      </div>
      <div class="card card-pad" style="border-left:4px solid #ef4444">
        <div class="mini-stat-num" id="statHMValorS" style="font-size:24px; font-weight:bold; color:#ef4444">S/ 0.00</div>
        <div class="mini-stat-label">Valor Producto (S/)</div>
      </div>
      <div class="card card-pad" style="border-left:4px solid #10b981">
        <div class="mini-stat-num" id="statHMRecuperado" style="font-size:24px; font-weight:bold; color:#10b981">S/ 0.00</div>
        <div class="mini-stat-label">Valor Recuperado (S/)</div>
      </div>
    </div>

    <div class="dashboard-grid grid-2" style="margin-bottom:16px">
      <div class="card chart-card"><h4 class="card-title">Por Categoría H&M</h4><div class="chart-wrap" style="height:250px"><canvas id="chartHMCategoria"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Por Subcategoría</h4><div class="chart-wrap" style="height:250px"><canvas id="chartHMSubcat"></canvas></div></div>
      <div class="card chart-card col-span-2"><h4 class="card-title">Incidencias por Unidad</h4><div class="chart-wrap" style="height:300px"><canvas id="chartHMUnidad"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Ocurrencias Timeline</h4><div class="chart-wrap" style="height:250px"><canvas id="chartHMFechaL"></canvas></div></div>
      <div class="card chart-card"><h4 class="card-title">Valor Producto vs Recuperado</h4><div class="chart-wrap" style="height:250px"><canvas id="chartHMValor"></canvas></div></div>
    </div>

    <div class="card card-pad">
      <div class="table-wrap">
        <table id="tableHM" class="data-table">
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Unidad</th>
              <th>Usuario</th>
              <th>Categ</th>
              <th>SubCat</th>
              <th>V. S/</th>
              <th>V. Recup</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody id="hm-tbody">
            <tr><td colspan="8" style="text-align:center;padding:30px">Sin datos de H&M</td></tr>
          </tbody>
        </table>
      </div>
      <div id="hm-pagination" style="padding-top:14px;"></div>
    </div>
  `;

  setupFilters();

}

async function setupFilters() {
  const cfg = { searchEnabled: true, itemSelectText: 'Seleccionar', shouldSort: false };
  hmChoices.unidad = new Choices('#kpiHMUnidad', cfg);

  const end = new Date();
  const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
  hmFilters.fechaInicio = start.toISOString().split('T')[0];
  hmFilters.fechaFin = end.toISOString().split('T')[0];

  ($('#kpiHMFecha') as any).daterangepicker({
    startDate: start,
    endDate: end,
    locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'], firstDay: 1 }
  });

  $('#kpiHMFecha').on('apply.daterangepicker', (ev: any, picker: any) => {
    hmFilters.fechaInicio = picker.startDate.format('YYYY-MM-DD');
    hmFilters.fechaFin = picker.endDate.format('YYYY-MM-DD');
  });

  document.getElementById('btnKPIHMBuscar')?.addEventListener('click', () => applyFiltersAndFetch());
  document.getElementById('btnKPIHMExcel')?.addEventListener('click', exportToExcelFile);
  document.getElementById('btnKPIHMPDF')?.addEventListener('click', exportToPDFReport);

  setTimeout(() => applyFiltersAndFetch(), 500);
}

async function applyFiltersAndFetch() {
  const unidad = hmChoices.unidad.getValue(true) || 'Todas';

  hmCurrentPage = 1;
  lastVisibleDoc = null;
  allLoadedDocs = [];
  const tbody = document.getElementById('hm-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">Cargando...</td></tr>';

  UI.showLoader('Filtrando Incidencias H&M...', 'Consultando base de datos', 20);
  hmFilters.unidad = unidad === 'Todas' ? '' : unidad;

  try {
    let q = query(collection(db, 'INCIDENCIASHYM_REGISTRADAS'), limit(PAGE_SIZE));



    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      UI.toast('No se encontraron incidencias', 'info');
      document.getElementById('hm-load-more-container')!.style.display = 'none';

      UI.hideLoader();
      return;
    }




    const newRecords = snapshot.docs.map(doc => {
      const d = doc.data();
      let ts = null;
      if (d.fechaRegistro && d.fechaRegistro.toDate) ts = d.fechaRegistro.toDate();
      else if (d.fechaRegistro) ts = moment(d.fechaRegistro, ['YYYY-MM-DD', 'DD/MM/YYYY']).toDate();

      return {
        id: doc.id,
        ...d,
        _ts: ts,
        vProd: parseHmValue(d.valorProductos || d.valorProducto),
        vRecup: parseHmValue(d.valorRecuperacion)
      };
    });

    newRecords.forEach(r => allLoadedDocs.push(r));

    let filtered = allLoadedDocs;

    const uniqueUnits = [...new Set(filtered.map(r => r.unida || r.unidad || ''))].filter(u => u).sort();
    const current = hmChoices.unidad.getValue(true);
    hmChoices.unidad.clearChoices();
    hmChoices.unidad.setChoices([{ value: 'Todas', label: 'Todas las unidades', selected: !current || current === 'Todas' }].concat(uniqueUnits.map(u => ({ value: u, label: u, selected: u === current }))), 'value', 'label', true);

    if (hmFilters.fechaInicio || hmFilters.fechaFin) {
      const startStr = hmFilters.fechaInicio;
      const endStr = hmFilters.fechaFin;
      filtered = filtered.filter(r => {
        if (!r._ts) return false;
        const dStr = r._ts.toISOString().split('T')[0];
        if (startStr && dStr < startStr) return false;
        if (endStr && dStr > endStr) return false;
        return true;
      });
    }

    if (hmFilters.unidad) {
      filtered = filtered.filter(r => (r.unida || r.unidad || '') === hmFilters.unidad);
    }

    filtered.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    hmData = filtered;

    renderStats();
    drawCharts();
    renderTable();

  } catch (e) {
    console.error('Error in HM fetch:', e);
    UI.toast('Error al cargar datos', 'error');
  } finally {
    UI.hideLoader();
  }
}

function parseHmValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = val.toString().replace(/S\/\.?\s*/gi, '').trim();
  if (str.indexOf('.') > -1) str = str.replace(/,/g, '');
  else if (str.indexOf(',') > -1) {
    if (/,\d{1,2}$/.test(str)) str = str.replace(',', '.');
    else str = str.replace(/,/g, '');
  }
  let res = parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
  if (res > 100 && res < 10000 && res % 100 === 0) res /= 100;
  return res;
}

function renderStats() {
  let sumProd = 0, sumRec = 0;
  hmData.forEach(r => { sumProd += r.vProd; sumRec += r.vRecup; });

  const elCant = document.getElementById('statHMCantidad');
  const elProd = document.getElementById('statHMValorS');
  const elRec = document.getElementById('statHMRecuperado');

  if (elCant) elCant.textContent = hmData.length.toLocaleString('es-PE');
  if (elProd) elProd.textContent = 'S/ ' + sumProd.toLocaleString('es-PE', { minimumFractionDigits: 2 });
  if (elRec) elRec.textContent = 'S/ ' + sumRec.toLocaleString('es-PE', { minimumFractionDigits: 2 });
}

function drawCharts() {
  drawPie(document.getElementById('chartHMCategoria'), 'cat', 'tipoIncidente');
  drawPie(document.getElementById('chartHMSubcat'), 'sub', 'subCategoria');
  drawBar(document.getElementById('chartHMUnidad'), 'unit', 'unidad', true);
  drawBar(document.getElementById('chartHMFechaL'), 'date', '_ts_date', false);
  drawComparison();
}

function drawPie(ctx: any, id: string, field: string) {
  if (!ctx) return;
  if (hmCharts[id]) hmCharts[id].destroy();
  const counts: Record<string, number> = {};
  hmData.forEach(r => { const val = r[field] || 'S/D'; counts[val] = (counts[val] || 0) + 1; });

  hmCharts[id] = new Chart(ctx, {
    type: 'pie',
    data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } } } }
  });
}

function drawBar(ctx: any, id: string, field: string, horizontal: boolean) {
  if (!ctx) return;
  if (hmCharts[id]) hmCharts[id].destroy();
  const counts: Record<string, number> = {};
  hmData.forEach(r => {
    let val = '';
    if (field === '_ts_date') val = r._ts ? moment(r._ts).format('DD/MM') : 'S/F';
    else val = r.unida || r.unidad || 'S/D';
    counts[val] = (counts[val] || 0) + 1;
  });

  const sorted = Object.keys(counts).sort();
  hmCharts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted, datasets: [{ label: 'Incidentes', data: sorted.map(k => counts[k]), backgroundColor: horizontal ? '#3b82f6' : '#10b981' }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x' as any,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94a3b8', font: { size: 10 } } }, y: { ticks: { color: '#94a3b8', stepSize: 1 } } }
    }
  });
}

function drawComparison() {
  const ctx = document.getElementById('chartHMValor') as HTMLCanvasElement;
  if (!ctx) return;
  if (hmCharts.val) hmCharts.val.destroy();

  const monthly: Record<string, { prod: number, rec: number }> = {};
  hmData.forEach(r => {
    if (!r._ts) return;
    const m = moment(r._ts).format('MMM YY');
    if (!monthly[m]) monthly[m] = { prod: 0, rec: 0 };
    monthly[m].prod += r.vProd;
    monthly[m].rec += r.vRecup;
  });

  const labels = Object.keys(monthly);
  hmCharts.val = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Producto', data: labels.map(l => monthly[l].prod), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 },
        { label: 'Recuperado', data: labels.map(l => monthly[l].rec), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } }
  });
}

function renderTable() {
  const tbody = document.getElementById('hm-tbody');
  if (!tbody) return;
  if (hmData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">Sin datos de H&M</td></tr>';
    const pg = document.getElementById('hm-pagination'); if (pg) pg.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(hmData.length / ITEMS_PER_PAGE);
  if (hmCurrentPage > totalPages) hmCurrentPage = totalPages;
  const start = (hmCurrentPage - 1) * ITEMS_PER_PAGE;
  const pageData = hmData.slice(start, start + ITEMS_PER_PAGE);

  let html = '';
  pageData.forEach(r => {
    html += `<tr>
      <td>${r._ts ? moment(r._ts).format('DD/MM/YYYY HH:mm') : '-'}</td>
      <td>${r.unida || r.unidad || '-'}</td>
      <td>${r.usuarioNombre || r.usuario || '-'}</td>
      <td>${r.tipoIncidente || '-'}</td>
      <td>${r.subCategoria || '-'}</td>
      <td style="text-align:right;color:#ef4444">S/ ${r.vProd.toFixed(2)}</td>
      <td style="text-align:right;color:#10b981">S/ ${r.vRecup.toFixed(2)}</td>
      <td title="${r.observaciones || ''}">${(r.observaciones || '-').substring(0, 50)}...</td>
    </tr>`;
  });
  tbody.innerHTML = html;
  renderHMPagination(totalPages);
}

async function exportToExcelFile() {
  if (!hmData.length) return alert('No hay datos');
  const data = hmData.map(r => ({
    'FECHA': r._ts ? moment(r._ts).format('DD/MM/YYYY HH:mm') : '-',
    'UNIDAD': r.unida || r.unidad || '-',
    'USUARIO': r.usuarioNombre || r.usuario || '-',
    'CATEGORIA': r.tipoIncidente || '-',
    'SUBCATEGORIA': r.subCategoria || '-',
    'VALOR PRODUCTO': r.vProd,
    'VALOR RECUPERO': r.vRecup,
    'OBSERVACIONES': r.observaciones || '-'
  }));
  await exportToExcel(data, `IncidenciasHM_${new Date().toISOString().split('T')[0]}`,
    ['FECHA', 'UNIDAD', 'USUARIO', 'CATEGORIA', 'SUBCATEGORIA', 'VALOR PRODUCTO', 'VALOR RECUPERO', 'OBSERVACIONES']
  );
}

async function exportToPDFReport() {
  if (!hmData.length) {
    UI.toast('No hay datos para exportar', 'warning');
    return;
  }

  UI.showLoader('Generando PDF...', 'Preparando reporte de H&M');

  try {
    const logo = await getLogoBase64();

    let sumProd = 0, sumRec = 0;
    hmData.forEach(r => { sumProd += r.vProd; sumRec += r.vRecup; });

    // Stats for Chart (Category)
    const counts: Record<string, number> = {};
    hmData.forEach(r => { const val = r.tipoIncidente || 'S/D'; counts[val] = (counts[val] || 0) + 1; });
    const labels = Object.keys(counts);
    const data = Object.values(counts);

    const chartImage = await generateChartImage(
      labels.map((l, i) => `${l}: ${data[i]}`),
      data,
      ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
    );

    const tableData = hmData.map(r => [
      r._ts ? moment(r._ts).format('DD/MM/YYYY HH:mm') : '-',
      r.unida || r.unidad || '-',
      r.usuarioNombre || r.usuario || '-',
      r.tipoIncidente || '-',
      r.subCategoria || '-',
      `S/ ${r.vProd.toFixed(2)}`,
      `S/ ${r.vRecup.toFixed(2)}`,
      (r.observaciones || '-').substring(0, 40)
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
                text: 'REPORTE DE INCIDENCIAS H&M',
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
              width: '35%',
              stack: [
                { text: 'RESUMEN FINANCIERO', bold: true, margin: [0, 10, 0, 10], color: '#1565C0' },
                {
                  table: {
                    widths: ['70%', '30%'],
                    body: [
                      ['Cantidad:', { text: hmData.length.toString(), bold: true }],
                      [{ text: 'Valor Producto:', color: '#ef4444' }, { text: `S/ ${sumProd.toFixed(2)}`, color: '#ef4444', bold: true }],
                      [{ text: 'Valor Recuperado:', color: '#10b981' }, { text: `S/ ${sumRec.toFixed(2)}`, color: '#10b981', bold: true }]
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
            widths: ['12%', '12%', '12%', '12%', '10%', '10%', '10%', '22%'],
            body: [
              [
                { text: 'FECHA/HORA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'UNIDAD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'USUARIO', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'CATEGORÍA', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'SUBCAT', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'V. PROD', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'V. RECUP', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 },
                { text: 'OBSERVACIONES', bold: true, fillColor: '#1565C0', color: 'white', alignment: 'center', fontSize: 9 }
              ],
              ...tableData.map(fila => fila.map((cell, idx) => ({
                text: cell,
                fontSize: 8,
                alignment: idx === 5 || idx === 6 ? 'right' : 'center',
                color: idx === 5 ? '#ef4444' : (idx === 6 ? '#10b981' : '#333'),
                bold: idx === 5 || idx === 6
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

    await exportToPDF(docDef, `ReporteIncidenciasHM_${Date.now()}.pdf`);
    UI.toast('PDF Exportado', 'success');
  } catch (e: any) {
    console.error('Error H&M PDF:', e);
    UI.toast('Error al exportar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}


function renderHMPagination(totalPages: number) {
  const container = document.getElementById('hm-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const rangeStart = (hmCurrentPage - 1) * ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(hmCurrentPage * ITEMS_PER_PAGE, hmData.length);

  let pages: (number | string)[] = [];
  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pages = [1];
    if (hmCurrentPage > 3) pages.push('...');
    const lo = Math.max(2, hmCurrentPage - 1);
    const hi = Math.min(totalPages - 1, hmCurrentPage + 1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hmCurrentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const btnS = (active: boolean, dis = false) =>
    'style="display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border-radius:6px;border:1px solid ' + (active ? 'var(--accent)' : 'rgba(255,255,255,0.1)') + ';background:' + (active ? 'var(--accent)' : 'transparent') + ';color:' + (active ? '#fff' : dis ? 'rgba(255,255,255,0.25)' : '#cbd5e1') + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:' + (dis ? 'default' : 'pointer') + ';"';

  let html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:4px 0;">' +
    '<span style="font-size:12px;color:var(--text-muted)">Mostrando <strong style="color:var(--text)">' + rangeStart + '&ndash;' + rangeEnd + '</strong> de <strong style="color:var(--text)">' + hmData.length + '</strong> registros</span>' +
    '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">' +
    '<button id="hm-pg-prev" ' + btnS(false, hmCurrentPage === 1) + (hmCurrentPage === 1 ? ' disabled' : '') + '>&lsaquo;</button>';

  pages.forEach((p: any) => {
    if (p === '...') {
      html += '<span style="color:var(--text-muted);padding:0 3px;font-size:13px;">&#8230;</span>';
    } else {
      html += '<button class="hm-pg-num" data-page="' + p + '" ' + btnS(p === hmCurrentPage, false) + '>' + p + '</button>';
    }
  });

  html += '<button id="hm-pg-next" ' + btnS(false, hmCurrentPage === totalPages) + (hmCurrentPage === totalPages ? ' disabled' : '') + '>&rsaquo;</button>' +
    '</div></div>';

  container.innerHTML = html;

  document.getElementById('hm-pg-prev')?.addEventListener('click', () => {
    if (hmCurrentPage > 1) { hmCurrentPage--; renderTable(); }
  });
  document.getElementById('hm-pg-next')?.addEventListener('click', () => {
    if (hmCurrentPage < totalPages) { hmCurrentPage++; renderTable(); }
  });
  container.querySelectorAll('.hm-pg-num').forEach((b: any) => {
    b.addEventListener('click', () => {
      hmCurrentPage = parseInt(b.dataset.page || '1');
      renderTable();
    });
  });
}
