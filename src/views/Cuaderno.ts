import { UI } from '../ui';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { accessControl } from '../access-control';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { getLogoBase64, exportToPDF as pdfExportHelper } from '../pdf-utils';

const COLLECTIONS = {
  CUADERNO: 'CUADERNO',
  USERS: 'USUARIOS',
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

export async function initCuadernoView() {
  const container = document.getElementById('view-cuaderno');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Cuaderno de Ocurrencias</h2>
        <h4 class="muted">Registro diario de relevos y novedades</h4>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" id="btnExportCuadernoExcel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
          Exportar Excel
        </button>
        <button class="btn btn-primary" id="btnExportCuadernoPDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Imprimir PDF
        </button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="filters-bar" style="padding:0 0 16px 0; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="filter-group" style="flex:1; min-width:200px;">
          <label class="filter-label">Rango de Fecha</label>
          <input type="text" id="filtroCuadernoFecha" class="form-input" style="background-image:url('data:image/svg+xml,%3Csvg xmlns=\\\\'http://www.w3.org/2000/svg\\\\' viewBox=\\\\'0 0 24 24\\\\' fill=\\\\'none\\\\' stroke=\\\\'%2364748b\\\\' stroke-width=\\\\'2\\\\'%3E%3Crect x=\\\\'3\\\\' y=\\\\'4\\\\' width=\\\\'18\\\\' height=\\\\'18\\\\' rx=\\\\'2\\\\' ry=\\\\'2\\\\'/%3E%3Cline x1=\\\\'16\\\\' y1=\\\\'2\\\\' x2=\\\\'16\\\\' y2=\\\\'6\\\\'/%3E%3Cline x1=\\\\'8\\\\' y1=\\\\'2\\\\' x2=\\\\'8\\\\' y2=\\\\'6\\\\'/%3E%3Cline x1=\\\\'3\\\\' y1=\\\\'10\\\\' x2=\\\\'21\\\\' y2=\\\\'10\\\\'/%3E%3C/svg%3E'); background-repeat:no-repeat; background-position:right 10px center; background-size:16px;" />
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Cliente</label>
          <select id="filtroCuadernoCliente" class="form-input"><option value="">Todos</option></select>
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Unidad</label>
          <select id="filtroCuadernoUnidad" class="form-input"><option value="">Todas</option></select>
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnCuadernoBuscar" style="height:38px;">Buscar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table id="tableCuaderno">
          <thead>
            <tr>
              <th style="width:130px;">Fecha</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Tipo</th>
              <th>U. Entrante</th>
              <th>U. Saliente</th>
              <th>Responsable</th>
              <th>Comentario</th>
              <th style="text-align:center;">IMG</th>
            </tr>
          </thead>
          <tbody id="cuadernoTbody">
            <tr><td colspan="9" style="text-align:center;padding:30px">Seleccione filtros y pulse Buscar</td></tr>
          </tbody>
        </table>
      </div>
      <div id="cuadernoPagination" class="pagination" style="display:none; justify-content:space-between; align-items:center;">
          <span class="page-info" id="cuadernoPageInfo">Página 1</span>
          <div>
            <button class="btn btn-secondary btn-sm" id="btnPrevCuaderno">Anterior</button>
            <button class="btn btn-secondary btn-sm" id="btnNextCuaderno">Siguiente</button>
          </div>
      </div>
    </div>
  `;

  await loadFilters();
  initDateRange();
  setupEvents();
}

let allCuadernoRecords: any[] = [];
let filteredCuadernoRecords: any[] = [];
let cuadernoPage = 1;
const ITEMS_PER_PAGE = 10;

async function loadFilters() {
  const selC = document.getElementById('filtroCuadernoCliente') as HTMLSelectElement;
  const selU = document.getElementById('filtroCuadernoUnidad') as HTMLSelectElement;
  if (!selC || !selU) return;

  try {
    const snap = await getDocs(collection(db, COLLECTIONS.CLIENT_UNITS));
    const clientes: string[] = [];
    (snap as any).forEach((d: any) => clientes.push(d.id));
    clientes.sort();

    // Si es cliente, solo ve su cliente
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
    const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${cliente}/UNIDADES`));
    const uni: string[] = [];
    (snap as any).forEach((d: any) => uni.push(d.id));
    uni.sort();

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
  ($ as any)('#filtroCuadernoFecha').daterangepicker({
    locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] },
    startDate: moment().subtract(7, 'days'),
    endDate: moment(),
    autoUpdateInput: true
  });
}

function setupEvents() {
  const btnSearch = document.getElementById('btnCuadernoBuscar');
  const btnExport = document.getElementById('btnExportCuadernoExcel');
  const btnPrev = document.getElementById('btnPrevCuaderno') as HTMLButtonElement;
  const btnNext = document.getElementById('btnNextCuaderno') as HTMLButtonElement;

  btnSearch?.addEventListener('click', () => {
    cuadernoPage = 1;
    fetchCuaderno();
  });

  btnPrev?.addEventListener('click', () => {
    if (cuadernoPage > 1) { cuadernoPage--; renderCuaderno(); }
  });

  btnNext?.addEventListener('click', () => {
    const total = Math.ceil(filteredCuadernoRecords.length / ITEMS_PER_PAGE);
    if (cuadernoPage < total) { cuadernoPage++; renderCuaderno(); }
  });

  btnExport?.addEventListener('click', exportToExcel);

  const btnPDF = document.getElementById('btnExportCuadernoPDF');
  btnPDF?.addEventListener('click', exportToPDFReport);
}

async function fetchCuaderno() {
  UI.showLoader('Buscando...', 'Consultando cuadernos', 20);

  try {
    const inputFecha = document.getElementById('filtroCuadernoFecha') as HTMLInputElement;
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Extraer fechas robustamente
    if (inputFecha && inputFecha.value) {
      const parts = inputFecha.value.split(' - ');
      if (parts.length === 2) {
        const [d1, m1, y1] = parts[0].split('/');
        startDate = new Date(Number(y1), Number(m1) - 1, Number(d1));
        const [d2, m2, y2] = parts[1].split('/');
        endDate = new Date(Number(y2), Number(m2) - 1, Number(d2), 23, 59, 59, 999);
      }
    }

    const cliSelect = document.getElementById('filtroCuadernoCliente') as HTMLSelectElement;
    const uniSelect = document.getElementById('filtroCuadernoUnidad') as HTMLSelectElement;

    const clientVal = cliSelect?.value || '';
    const unitVal = uniSelect?.value || '';

    let q = query(collection(db, COLLECTIONS.CUADERNO),
      orderBy('timestamp', 'desc'),
      limit(2000));

    // Por limitación de índices de Firebase si usamos where() con timestamp y luego cliente, lo filtramos todo en memoria tras traer un gran bloque.
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

    // Filtrado Memoria
    rawRows = rawRows.filter(r => {
      if (clientVal && r.cliente !== clientVal) return false;
      if (unitVal && r.unidad !== unitVal) return false;
      if (r.dateObj < startDate || r.dateObj > endDate) return false;
      return true;
    });

    allCuadernoRecords = rawRows;
    filteredCuadernoRecords = rawRows; // For search/sort if needed

    renderCuaderno();

  } catch (e) {
    console.error(e);
    UI.toast('Error al consultar cuaderno', 'error');
  } finally {
    UI.hideLoader();
  }
}

function renderCuaderno() {
  const tbody = document.getElementById('cuadernoTbody');
  const pagination = document.getElementById('cuadernoPagination');
  const info = document.getElementById('cuadernoPageInfo');
  const prev = document.getElementById('btnPrevCuaderno') as HTMLButtonElement;
  const next = document.getElementById('btnNextCuaderno') as HTMLButtonElement;
  if (!tbody || !pagination) return;

  if (filteredCuadernoRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px">No se encontraron registros en el rango.</td></tr>';
    pagination.style.display = 'none';
    return;
  }

  pagination.style.display = 'flex';
  const totalPages = Math.ceil(filteredCuadernoRecords.length / ITEMS_PER_PAGE);

  const start = (cuadernoPage - 1) * ITEMS_PER_PAGE;
  const paginated = filteredCuadernoRecords.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = paginated.map(r => {
    const d = r.dateObj as Date;
    const timeStr = d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const ue = r.usuarioEntrante?.nombre || r.usuarioEntrante?.id || '';
    const us = r.usuarioSaliente?.nombre || r.usuarioSaliente?.id || '';
    const user = r.usuario || ue || us || '';
    const tipo = r.tipoRegistro ? `<span class="badge badge-info">${r.tipoRegistro}</span>` : '';

    const fotoHTML = r.fotoURL ? `<a href="${r.fotoURL}" target="_blank"><img src="${r.fotoURL}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;border:1px solid rgba(255,255,255,0.1)"/></a>` : '<span class="muted">-</span>';

    return `
            <tr>
                <td style="font-size:12px; white-space:nowrap;">${timeStr}</td>
                <td><span class="font-medium">${r.cliente || ''}</span></td>
                <td>${r.unidad || ''}</td>
                <td>${tipo}</td>
                <td style="font-size:12px;">${ue}</td>
                <td style="font-size:12px;">${us}</td>
                <td style="font-size:12px;">${user}</td>
                <td style="font-size:12px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.comentario || ''} ">${r.comentario || ''}</td>
                <td style="text-align:center;">${fotoHTML}</td>
            </tr>
        `;
  }).join('');

  if (info) info.textContent = `Página ${cuadernoPage} de ${totalPages} (${filteredCuadernoRecords.length} en total)`;
  if (prev) prev.disabled = cuadernoPage === 1;
  if (next) next.disabled = cuadernoPage === totalPages;
}

function exportToExcel() {
  if (filteredCuadernoRecords.length === 0) return UI.toast('Busque datos primero', 'warning');

  const ws_data = [
    ['LIDER CONTROL - CUADERNO DE OCURRENCIAS'],
    [`Fecha Exportación: ${new Date().toLocaleString('es-PE')}`],
    [`Total Registros: ${filteredCuadernoRecords.length}`],
    [],
    ['FECHA Y HORA', 'CLIENTE', 'UNIDAD', 'TIPO', 'USUARIO ENTRANTE', 'USUARIO SALIENTE', 'RESPONSABLE', 'COMENTARIO', 'LINK FOTO']
  ];

  filteredCuadernoRecords.forEach(r => {
    const timeStr = r.dateObj.toLocaleString('es-PE');
    const ue = r.usuarioEntrante?.nombre || r.usuarioEntrante?.id || '';
    const us = r.usuarioSaliente?.nombre || r.usuarioSaliente?.id || '';
    const user = r.usuario || ue || us || '';

    ws_data.push([
      timeStr,
      r.cliente || '',
      r.unidad || '',
      r.tipoRegistro || '',
      ue,
      us,
      user,
      r.comentario || '',
      r.fotoURL || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, 'Cuaderno');
  XLSX.writeFile(wb, `Cuaderno_${moment().format('YYYYMMDD_HHmm')}.xlsx`);
  UI.toast('Exportando Excel...');
}

async function exportToPDFReport() {
  if (filteredCuadernoRecords.length === 0) return UI.toast('Busque datos primero', 'warning');

  UI.showLoader('Generando PDF...', 'Preparando reporte de Cuaderno');

  try {
    const logo = await getLogoBase64();
    const tableData = filteredCuadernoRecords.map(r => {
      const timeStr = r.dateObj.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      const ue = r.usuarioEntrante?.nombre || r.usuarioEntrante?.id || '';
      const us = r.usuarioSaliente?.nombre || r.usuarioSaliente?.id || '';
      const user = r.usuario || ue || us || '';

      return [
        { text: timeStr, fontSize: 8 },
        { text: r.cliente || '', fontSize: 8 },
        { text: r.unidad || '', fontSize: 8 },
        { text: r.tipoRegistro || '', fontSize: 8 },
        { text: ue, fontSize: 8 },
        { text: us, fontSize: 8 },
        { text: user, fontSize: 8 },
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
                text: 'REPORTE DE CUADERNO DE OCURRENCIAS',
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
            widths: ['12%', '12%', '12%', '10%', '12%', '12%', '12%', '18%'],
            body: [
              [
                { text: 'FECHA', style: 'tableHeader' },
                { text: 'CLIENTE', style: 'tableHeader' },
                { text: 'UNIDAD', style: 'tableHeader' },
                { text: 'TIPO', style: 'tableHeader' },
                { text: 'U. ENTRANTE', style: 'tableHeader' },
                { text: 'U. SALIENTE', style: 'tableHeader' },
                { text: 'RESPONSABLE', style: 'tableHeader' },
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

    await pdfExportHelper(docDef, `Cuaderno_${moment().format('YYYYMMDD_HHmm')}.pdf`);
    UI.toast('Reporte PDF generado');
  } catch (err) {
    console.error(err);
    UI.toast('Error al generar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}
