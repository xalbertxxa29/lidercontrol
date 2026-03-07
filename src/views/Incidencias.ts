import { UI } from '../ui';
import { db } from '../firebase';
import { collection, getDocs, query, where, limit, doc, updateDoc } from 'firebase/firestore';
import { accessControl } from '../access-control';
import * as XLSX from 'xlsx';
import { masterCache } from '../cache-service';
import moment from 'moment';
import { getLogoBase64, exportToPDF as pdfExportHelper } from '../pdf-utils';
// @ts-ignore
import pdfMake from 'pdfmake/build/pdfmake';
// @ts-ignore
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Registrar fuentes para pdfMake
if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
  (pdfMake as any).vfs = pdfFonts.pdfMake.vfs;
} else if ((pdfFonts as any).vfs) {
  (pdfMake as any).vfs = (pdfFonts as any).vfs;
}

const COLLECTIONS = {
  INCIDENTS: 'INCIDENCIAS_REGISTRADAS',
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

let allIncidents: any[] = [];
let filteredIncidents: any[] = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

export async function initIncidenciasView() {
  const container = document.getElementById('view-incidencias');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Incidencias Registradas</h2>
        <h4 class="muted">Historial completo de eventos y reportes</h4>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" id="btnExportIncidenciasExcel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
          Exportar Excel
        </button>
        <button class="btn btn-primary" id="btnExportIncidenciasPDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Imprimir PDF
        </button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="filters-bar" style="padding:0 0 16px 0; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="filter-group" style="flex:1; min-width:200px;">
          <label class="filter-label">Rango de Fecha</label>
          <input type="text" id="filtroIncFecha" class="form-input" style="background-image:url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2\\'%3E%3Crect x=\\'3\\' y=\\'4\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'/%3E%3Cline x1=\\'16\\' y1=\\'2\\' x2=\\'16\\' y2=\\'6\\'/%3E%3Cline x1=\\'8\\' y1=\\'2\\' x2=\\'8\\' y2=\\'6\\'/%3E%3Cline x1=\\'3\\' y1=\\'10\\' x2=\\'21\\' y2=\\'10\\'/%3E%3C/svg%3E'); background-repeat:no-repeat; background-position:right 10px center; background-size:16px;" />
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Cliente</label>
          <select id="filtroIncCliente" class="form-input"><option value="">Todos</option></select>
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Unidad</label>
          <select id="filtroIncUnidad" class="form-input"><option value="">Todas</option></select>
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Estado</label>
          <select id="filtroIncEstado" class="form-input">
            <option value="">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En proceso">En proceso</option>
            <option value="Resuelto">Resuelto</option>
            <option value="Cerrado">Cerrado</option>
          </select>
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnIncBuscar" style="height:38px;">Buscar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table id="tableIncidencias">
          <thead>
            <tr>
              <th style="width:130px;">Fecha</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Categoría</th>
              <th>Nivel Riesgo</th>
              <th>Estado</th>
              <th>Comentario</th>
              <th style="text-align:center; width:100px;">Acciones</th>
            </tr>
          </thead>
          <tbody id="incidenciasTbody">
            <tr><td colspan="8" style="text-align:center;padding:30px">Seleccione filtros y pulse Buscar</td></tr>
          </tbody>
        </table>
      </div>
      
      <div id="incidenciasPagination" class="pagination" style="display:none; justify-content:space-between; align-items:center; margin-top:20px;">
          <span class="page-info" id="incPageInfo">Página 1</span>
          <div>
            <button class="btn btn-secondary btn-sm" id="btnPrevInc">Anterior</button>
            <button class="btn btn-secondary btn-sm" id="btnNextInc">Siguiente</button>
          </div>
      </div>
    </div>
  `;

  await loadFilters();
  initDateRange();
  setupEvents();
}

async function loadFilters() {
  const selC = document.getElementById('filtroIncCliente') as HTMLSelectElement;
  const selU = document.getElementById('filtroIncUnidad') as HTMLSelectElement;
  if (!selC || !selU) return;

  try {
    const data = await masterCache.getClientUnits();
    const clientes: string[] = Object.keys(data).sort();

    if (accessControl.isCliente() && accessControl.state) {
      selC.innerHTML = `<option value="${accessControl.state.clienteAsignado}">${accessControl.state.clienteAsignado}</option>`;
      selC.disabled = true;
      loadUnidades(accessControl.state.clienteAsignado || '', selU);
    } else {
      selC.innerHTML = '<option value="">Todos los clientes</option>' + clientes.map(c => `<option value="${c}">${c}</option>`).join('');
      selC.addEventListener('change', () => loadUnidades(selC.value, selU));
    }
  } catch (e) { }
}

async function loadUnidades(cliente: string, selU: HTMLSelectElement) {
  if (!cliente) {
    selU.innerHTML = '<option value="">Todas las unidades</option>';
    return;
  }
  selU.innerHTML = '<option value="">Cargando...</option>';
  try {
    const data = await masterCache.getClientUnits();
    const uni: string[] = (data[cliente] || []).sort();

    if (accessControl.isCliente() && accessControl.state && accessControl.state.unidadesAsignadas && accessControl.state.unidadesAsignadas.length > 0) {
      const uniAsig = accessControl.state.unidadesAsignadas[0];
      selU.innerHTML = `<option value="${uniAsig}">${uniAsig}</option>`;
      selU.disabled = true;
    } else {
      selU.innerHTML = '<option value="">Todas las unidades</option>' + uni.map(u => `<option value="${u}">${u}</option>`).join('');
    }
  } catch (e) { selU.innerHTML = '<option value="">Error</option>'; }
}

function initDateRange() {
  ($ as any)('#filtroIncFecha').daterangepicker({
    locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] },
    startDate: moment().subtract(30, 'days'),
    endDate: moment(),
    autoUpdateInput: true
  });
}

function setupEvents() {
  const btnSearch = document.getElementById('btnIncBuscar');
  const btnExport = document.getElementById('btnExportIncidenciasExcel');
  const btnPrev = document.getElementById('btnPrevInc') as HTMLButtonElement;
  const btnNext = document.getElementById('btnNextInc') as HTMLButtonElement;
  const tbody = document.getElementById('incidenciasTbody');

  btnSearch?.addEventListener('click', () => {
    currentPage = 1;
    fetchIncidencias();
  });

  btnPrev?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderIncidencias(); }
  });

  btnNext?.addEventListener('click', () => {
    const total = Math.ceil(filteredIncidents.length / ITEMS_PER_PAGE);
    if (currentPage < total) { currentPage++; renderIncidencias(); }
  });

  btnExport?.addEventListener('click', exportToExcel);

  const btnPDF = document.getElementById('btnExportIncidenciasPDF');
  btnPDF?.addEventListener('click', exportToPDFGeneral);

  tbody?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('.btn-edit-inc');
    const pdfBtn = target.closest('.btn-pdf-inc');

    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const inc = filteredIncidents.find(i => i.id === id);
      if (inc) openEditModal(inc);
    }

    if (pdfBtn) {
      const id = pdfBtn.getAttribute('data-id');
      const inc = filteredIncidents.find(i => i.id === id);
      if (inc) generatePDF(inc);
    }
  });
}

async function fetchIncidencias() {
  const picker = ($ as any)('#filtroIncFecha').data('daterangepicker');
  if (!picker) return;

  const cliSelect = document.getElementById('filtroIncCliente') as HTMLSelectElement;
  const uniSelect = document.getElementById('filtroIncUnidad') as HTMLSelectElement;
  const estSelect = document.getElementById('filtroIncEstado') as HTMLSelectElement;

  const startDate = picker.startDate.toDate();
  const endDate = picker.endDate.toDate();
  endDate.setHours(23, 59, 59, 999);

  const clientVal = cliSelect.value;
  const unitVal = uniSelect.value;
  const stateVal = estSelect.value;

  UI.showLoader('Buscando...', 'Consultando incidencias', 20);

  try {
    let q = query(collection(db, COLLECTIONS.INCIDENTS),
      limit(2000));

    const snap = await getDocs(q);

    let rawRows = snap.docs.map(d => {
      const data = d.data() as any;
      const rawTs = data.timestamp;
      let dObj = new Date(0);
      if (rawTs?.toDate) dObj = rawTs.toDate();
      else if (typeof rawTs === 'number') dObj = new Date(rawTs);
      else if (typeof rawTs === 'string') dObj = new Date(rawTs);

      return { id: d.id, ...data, dateObj: dObj };
    });

    // Filtrado Memoria (para evitar índices compuestos no existentes)
    rawRows = rawRows.filter(r => {
      if (clientVal && r.cliente !== clientVal) return false;
      if (unitVal && r.unidad !== unitVal) return false;
      if (stateVal && r.estado !== stateVal) return false;
      if (r.dateObj < startDate || r.dateObj > endDate) return false;
      return true;
    });

    rawRows.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    allIncidents = rawRows;
    filteredIncidents = rawRows;

    renderIncidencias();

  } catch (e) {
    console.error(e);
    UI.toast('Error al consultar incidencias', 'error');
  } finally {
    UI.hideLoader();
  }
}

function renderIncidencias() {
  const tbody = document.getElementById('incidenciasTbody');
  const pagination = document.getElementById('incidenciasPagination');
  const info = document.getElementById('incPageInfo');
  const prev = document.getElementById('btnPrevInc') as HTMLButtonElement;
  const next = document.getElementById('btnNextInc') as HTMLButtonElement;
  if (!tbody || !pagination) return;

  if (filteredIncidents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">No se encontraron registros en el rango.</td></tr>';
    pagination.style.display = 'none';
    return;
  }

  pagination.style.display = 'flex';
  const totalPages = Math.ceil(filteredIncidents.length / ITEMS_PER_PAGE);

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filteredIncidents.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = paginated.map(r => {
    const d = r.dateObj as Date;
    const timeStr = d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `
            <tr>
                <td style="font-size:12px; white-space:nowrap;">${timeStr}</td>
                <td style="font-weight:500;">${r.cliente || ''}</td>
                <td>${r.unidad || ''}</td>
                <td><span class="badge badge-info">${r.tipoIncidente || ''}</span></td>
                <td><span class="badge" style="background:rgba(255,255,255,0.05); color:var(--fg); border:1px solid rgba(255,255,255,0.1)">${r.Nivelderiesgo || ''}</span></td>
                <td><span class="badge ${r.estado === 'Cerrado' ? 'badge-success' : 'badge-warning'}">${r.estado || ''}</span></td>
                <td style="font-size:12px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.comentario || ''}">${r.comentario || ''}</td>
                <td style="text-align:center; white-space:nowrap;">
                    <button class="btn btn-icon btn-edit-inc" data-id="${r.id}" title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-icon btn-pdf-inc" data-id="${r.id}" title="PDF">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H9h1"/></svg>
                    </button>
                </td>
            </tr>
        `;
  }).join('');

  if (info) info.textContent = `Página ${currentPage} de ${totalPages} (${filteredIncidents.length} en total)`;
  if (prev) prev.disabled = currentPage === 1;
  if (next) next.disabled = currentPage === totalPages;
}

function openEditModal(inc: any) {
  const modalHTML = `
    <div id="modalEditInc" class="modal-overlay" style="display:flex; z-index:1100; position:fixed; top:0; left:0; right:0; bottom:0; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px);">
      <div class="modal-content card" style="width:90%; max-width:600px; max-height:90vh; overflow-y:auto; padding:24px;">
        <div class="modal-header">
          <h3>Editar Incidencia</h3>
          <button class="btn-close-modal" id="btnCloseEditInc">✕</button>
        </div>
        <form id="formEditInc" class="modal-form">
          <div class="form-row">
            <div class="form-group">
                <label>Cliente</label>
                <input type="text" value="${inc.cliente}" disabled readonly />
            </div>
            <div class="form-group">
                <label>Unidad</label>
                <input type="text" value="${inc.unidad}" disabled readonly />
            </div>
          </div>
          <div class="form-group">
            <label>Categoría</label>
            <input type="text" name="tipoIncidente" value="${inc.tipoIncidente || ''}" />
          </div>
          <div class="form-row">
            <div class="form-group">
                <label>Nivel de Riesgo</label>
                <select name="Nivelderiesgo">
                    <option value="BAJO" ${inc.Nivelderiesgo === 'BAJO' ? 'selected' : ''}>BAJO</option>
                    <option value="MEDIO" ${inc.Nivelderiesgo === 'MEDIO' ? 'selected' : ''}>MEDIO</option>
                    <option value="ALTO" ${inc.Nivelderiesgo === 'ALTO' ? 'selected' : ''}>ALTO</option>
                    <option value="CRÍTICO" ${inc.Nivelderiesgo === 'CRÍTICO' ? 'selected' : ''}>CRÍTICO</option>
                </select>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <select name="estado">
                    <option value="Pendiente" ${inc.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="En proceso" ${inc.estado === 'En proceso' ? 'selected' : ''}>En proceso</option>
                    <option value="Resuelto" ${inc.estado === 'Resuelto' ? 'selected' : ''}>Resuelto</option>
                    <option value="Cerrado" ${inc.estado === 'Cerrado' ? 'selected' : ''}>Cerrado</option>
                </select>
            </div>
          </div>
          <div class="form-group">
            <label>Comentario</label>
            <textarea name="comentario" rows="3">${inc.comentario || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Comentario de Cierre (Opcional)</label>
            <textarea name="comentarioCierre" rows="2">${inc.comentarioCierre || ''}</textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btnCancelEditInc">Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar Cambios</button>
          </div>
        </form>
      </div>
    </div>
    `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('modalEditInc');
  const form = document.getElementById('formEditInc') as HTMLFormElement;
  const btnClose = document.getElementById('btnCloseEditInc');
  const btnCancel = document.getElementById('btnCancelEditInc');

  const close = () => modal?.remove();
  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const updates: any = {};
    formData.forEach((value, key) => {
      updates[key] = value;
    });

    UI.showLoader('Guardando...', 'Actualizando incidencia', 50);
    try {
      await updateDoc(doc(db, COLLECTIONS.INCIDENTS, inc.id), updates);
      UI.toast('Incidencia actualizada');
      close();
      fetchIncidencias();
    } catch (err) {
      UI.toast('Error al actualizar', 'error');
    } finally {
      UI.hideLoader();
    }
  });
}

function exportToExcel() {
  if (filteredIncidents.length === 0) return UI.toast('Busque datos primero', 'warning');

  const ws_data = [
    ['LIDER CONTROL - REPORTE DE INCIDENCIAS'],
    [`Fecha Exportación: ${new Date().toLocaleString('es-PE')}`],
    [`Total Registros: ${filteredIncidents.length}`],
    [],
    ['FECHA', 'CLIENTE', 'UNIDAD', 'CATEGORÍA', 'NIVEL DE RIESGO', 'ESTADO', 'COMENTARIO']
  ];

  filteredIncidents.forEach(r => {
    ws_data.push([
      r.dateObj.toLocaleString('es-PE'),
      r.cliente || '',
      r.unidad || '',
      r.tipoIncidente || '',
      r.Nivelderiesgo || '',
      r.estado || '',
      r.comentario || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
  XLSX.writeFile(wb, `Incidencias_${moment().format('YYYYMMDD_HHmm')}.xlsx`);
  UI.toast('Exportando Excel...');
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    let urlFinal = url;
    if (!urlFinal.includes('alt=')) {
      urlFinal = urlFinal + (urlFinal.includes('?') ? '&' : '?') + 'alt=media';
    }

    // Usar un proxy CORS público para evitar el bloqueo del Canvas en el navegador al generar PDFs
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(urlFinal);

    let response;
    try {
      response = await fetch(proxyUrl);
    } catch (e) {
      // Fallback
      response = await fetch(urlFinal, { mode: 'cors' });
    }

    if (!response || !response.ok) {
      const fallbackRes = await fetch(urlFinal, { mode: 'cors' });
      if (!fallbackRes.ok) return null;
      response = fallbackRes;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error fetching image for base64', error);
    return null;
  }
}

async function generatePDF(inc: any) {
  UI.showLoader('Generando PDF...', 'Construyendo reporte', 30);

  try {
    let fechaSoloFecha = 'N/A';
    if (inc.dateObj) {
      fechaSoloFecha = inc.dateObj.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // Cargar foto Base64 asíncronamente
    let fotoDataUrl: string | null = null;
    if (inc.fotoURL) {
      UI.showLoader('Generando PDF...', 'Descargando evidencia fotográfica...', 40);
      fotoDataUrl = await urlToBase64(inc.fotoURL);
    }

    const colorPrimario = '#2c5aa0';
    const colorSecundario = '#c41e3a';
    const content: any[] = [];

    // ENCABEZADO CON NÚMERO Y FECHA
    content.push({
      columns: [
        { text: `REPORTE Nº ${inc.id?.toString().slice(-3) || '---'}`, style: 'reportNumber', width: '60%' },
        {
          stack: [
            { text: 'Fecha:', fontSize: 10, bold: true, color: colorPrimario, alignment: 'right' },
            { text: fechaSoloFecha, fontSize: 11, bold: true, alignment: 'right' }
          ],
          width: '40%'
        }
      ],
      margin: [0, 0, 0, 15]
    });

    // LÍNEA SEPARADORA
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: colorPrimario }], margin: [0, 0, 0, 12] });

    // DATOS DEL REPORTE (TIPO, CLIENTE, RIESGO, UNIDAD)
    content.push({
      table: {
        widths: ['25%', '25%', '25%', '25%'],
        body: [
          [
            { text: 'Tipo de Incidente:', bold: true, color: colorPrimario, fontSize: 10 },
            { text: inc.tipoIncidente || '-', fontSize: 10 },
            { text: 'Nivel de Riesgo:', bold: true, color: colorPrimario, fontSize: 10 },
            { text: inc.Nivelderiesgo || '-', bold: true, color: colorSecundario, fontSize: 11 }
          ],
          [
            { text: 'Cliente:', bold: true, color: colorPrimario, fontSize: 10 },
            { text: inc.cliente || '-', fontSize: 10 },
            { text: 'Unidad/Sede:', bold: true, color: colorPrimario, fontSize: 10 },
            { text: inc.unidad || '-', fontSize: 10 }
          ]
        ]
      },
      layout: {
        hLineWidth: (i: number) => i === 0 ? 1 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#ddd',
        vLineColor: () => '#ddd',
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      },
      margin: [0, 0, 0, 12]
    });

    // SECCIÓN: DETALLE DEL INCIDENTE
    content.push({ text: 'DETALLE DEL INCIDENTE', style: 'sectionTitle', margin: [0, 0, 0, 8] });
    content.push({
      table: {
        widths: ['100%'],
        body: [
          [{ text: inc.detalleIncidente || inc.comentario || 'Sin detalles registrados', alignment: 'left', fontSize: 10, margin: [5, 5, 5, 5] }]
        ]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#bbb',
        vLineColor: () => '#bbb',
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8
      },
      margin: [0, 0, 0, 12]
    });

    // INFORMACIÓN DEL REGISTRO
    content.push({
      table: {
        widths: ['25%', '25%', '25%', '25%'],
        body: [
          [
            { text: 'Reportado por:', bold: true, color: colorPrimario, fontSize: 9 },
            { text: inc.registradoPor || '-', fontSize: 9 },
            { text: 'Puesto:', bold: true, color: colorPrimario, fontSize: 9 },
            { text: inc.puesto || '-', fontSize: 9 }
          ],
          [
            { text: 'Estado:', bold: true, color: colorPrimario, fontSize: 9 },
            { text: inc.estado || '-', fontSize: 9 },
            { text: 'Supervisor:', bold: true, color: colorPrimario, fontSize: 9 },
            { text: inc.supervisor || '-', fontSize: 9 }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#ddd',
        vLineColor: () => '#ddd',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5
      },
      margin: [0, 0, 0, 12]
    });

    // SECCIÓN: EVIDENCIA/COMENTARIOS DE CIERRE
    if (inc.comentarioCierre) {
      content.push({ text: 'COMENTARIO DE CIERRE:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
      content.push({
        table: {
          widths: ['100%'],
          body: [
            [{ text: inc.comentarioCierre, alignment: 'left', fontSize: 10 }]
          ]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#bbb',
          vLineColor: () => '#bbb',
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 8,
          paddingBottom: () => 8
        },
        margin: [0, 0, 0, 15]
      });
    }

    // Agregar foto si existe
    if (fotoDataUrl) {
      content.push({ text: 'FOTOGRAFÍA DE EVIDENCIA:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
      content.push({
        image: fotoDataUrl,
        width: 250,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      });
    } else if (inc.fotoURL) {
      // Si no se pudo descargar pero existe URL, mostrar texto con el link
      content.push({ text: 'FOTOGRAFÍA DE EVIDENCIA:', style: 'sectionTitle', margin: [0, 15, 0, 8] });
      content.push({
        text: '(No se pudo descargar la imagen por políticas CORS o error de red)',
        fontSize: 9,
        color: '#ff0000',
        alignment: 'center',
        margin: [0, 0, 0, 20],
        italics: true
      });
    }

    // FIRMAS
    content.push({ text: '\n\n' });
    content.push({
      table: {
        widths: ['50%', '50%'],
        body: [
          [
            { text: '________________________________', alignment: 'center', fontSize: 9, margin: [0, 10, 0, 0] },
            { text: '________________________________', alignment: 'center', fontSize: 9, margin: [0, 10, 0, 0] }
          ],
          [
            { text: `Firma: ${inc.registradoPor || ''}`, alignment: 'center', fontSize: 9, margin: [0, 5, 0, 0] },
            { text: `Supervisor: ${inc.supervisor || ''}`, alignment: 'center', fontSize: 9, margin: [0, 5, 0, 0] }
          ],
          [
            { text: 'Reportado por', alignment: 'center', fontSize: 8, italics: true, color: '#666' },
            { text: 'Supervisor de Seguridad', alignment: 'center', fontSize: 8, italics: true, color: '#666' }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
      }
    });

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content: content,
      styles: {
        reportNumber: {
          fontSize: 20,
          bold: true,
          color: colorSecundario,
          margin: [0, 5, 0, 5]
        },
        sectionTitle: {
          fontSize: 11,
          bold: true,
          color: '#fff',
          fillColor: colorPrimario,
          alignment: 'left',
          margin: [0, 8, 0, 8]
        }
      }
    };

    pdfMake.createPdf(docDefinition).download(`Reporte_Incidencia_${inc.id || Date.now()}.pdf`);
    UI.toast('Reporte PDF descargado');
  } catch (err) {
    console.error(err);
    UI.toast('Error al generar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}

async function exportToPDFGeneral() {
  if (filteredIncidents.length === 0) return UI.toast('Busque datos primero', 'warning');

  UI.showLoader('Generando PDF...', 'Preparando reporte general de Incidencias');

  try {
    const logo = await getLogoBase64();
    const tableData = filteredIncidents.map(r => {
      const timeStr = r.dateObj.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

      return [
        { text: timeStr, fontSize: 8 },
        { text: r.cliente || '', fontSize: 8 },
        { text: r.unidad || '', fontSize: 8 },
        { text: r.tipoIncidente || '', fontSize: 8 },
        { text: r.Nivelderiesgo || '', fontSize: 8 },
        { text: r.estado || '', fontSize: 8 },
        { text: r.comentario || '', fontSize: 8 }
      ];
    });

    const docDef: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [30, 60, 30, 40],
      header: function (currentPage: number) {
        if (currentPage === 1) {
          return {
            columns: [
              logo ? { image: logo, width: 45, height: 45 } : { text: '' },
              {
                text: 'REPORTE GENERAL DE INCIDENCIAS',
                fontSize: 14,
                bold: true,
                alignment: 'center',
                margin: [0, 15, 0, 0],
                color: '#1565C0'
              },
              { text: `Fecha: ${new Date().toLocaleDateString()}`, width: 80, fontSize: 8, alignment: 'right', margin: [0, 20, 0, 0] }
            ],
            margin: [30, 10, 30, 0]
          };
        }
      },
      footer: function (currentPage: number, pageCount: number) {
        return {
          text: `Página ${currentPage} de ${pageCount} | Generado por LiderControl`,
          alignment: 'center',
          fontSize: 8,
          margin: [0, 10, 0, 0],
          color: '#777'
        };
      },
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['15%', '15%', '15%', '12%', '10%', '10%', '23%'],
            body: [
              [
                { text: 'FECHA', style: 'tableHeader' },
                { text: 'CLIENTE', style: 'tableHeader' },
                { text: 'UNIDAD', style: 'tableHeader' },
                { text: 'CATEGORÍA', style: 'tableHeader' },
                { text: 'RIESGO', style: 'tableHeader' },
                { text: 'ESTADO', style: 'tableHeader' },
                { text: 'COMENTARIO', style: 'tableHeader' }
              ],
              ...tableData
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex === 0) ? '#1565C0' : (rowIndex % 2 === 0) ? '#f3f4f6' : null;
            },
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#ddd',
            vLineColor: () => '#ddd'
          }
        }
      ],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 9,
          color: 'white',
          alignment: 'center',
          margin: [0, 2, 0, 2]
        }
      }
    };

    await pdfExportHelper(docDef, `Incidencias_General_${moment().format('YYYYMMDD_HHmm')}.pdf`);
    UI.toast('Reporte PDF generado');
  } catch (err) {
    console.error(err);
    UI.toast('Error al generar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}

