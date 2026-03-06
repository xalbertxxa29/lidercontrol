import { UI } from '../ui';
import { db } from '../firebase';
import { accessControl } from '../access-control';
import { masterCache } from '../cache-service';
import { collection, getDocs, query, limit, startAfter } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import moment from 'moment';
import { getLogoBase64, exportToPDF as pdfExportHelper } from '../pdf-utils';

const COLLECTIONS = {
  TIEMPO_CONEXION: 'CONTROL_TIEMPOS_USUARIOS',
  USERS: 'USUARIOS',
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

let allConexions: any[] = [];
let filteredConexions: any[] = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let usersCache: any = {};

export async function initTiempoConexionView() {
  const container = document.getElementById('view-tiempo-conexion');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Tiempo de Conexión</h2>
        <h4 class="muted">Desempeño y conectividad del personal operativo</h4>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" id="btnExportConexionExcel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
          Exportar Excel
        </button>
        <button class="btn btn-primary" id="btnExportConexionPDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Imprimir PDF
        </button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="filters-bar" style="padding:0 0 16px 0; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="filter-group" style="flex:1; min-width:200px;">
          <label class="filter-label">Rango de Fecha</label>
          <input type="text" id="filtroConexionFecha" class="form-input" style="background-image:url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2364748b\\' stroke-width=\\'2\\'%3E%3Crect x=\\'3\\' y=\\'4\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'/%3E%3Cline x1=\\'16\\' y1=\\'2\\' x2=\\'16\\' y2=\\'6\\'/%3E%3Cline x1=\\'8\\' y1=\\'2\\' x2=\\'8\\' y2=\\'6\\'/%3E%3Cline x1=\\'3\\' y1=\\'10\\' x2=\\'21\\' y2=\\'10\\'/%3E%3C/svg%3E'); background-repeat:no-repeat; background-position:right 10px center; background-size:16px;" />
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Cliente</label>
          <select id="filtroConexionCliente" class="form-input"><option value="">Todos</option></select>
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Unidad</label>
          <select id="filtroConexionUnidad" class="form-input"><option value="">Todas</option></select>
        </div>
        <div class="filter-group" style="flex:1; min-width:150px;">
          <label class="filter-label">Usuario</label>
          <select id="filtroConexionUsuario" class="form-input"><option value="">Todos</option></select>
        </div>
        <div class="filter-group" style="padding-bottom:2px">
          <button class="btn btn-primary" id="btnConexionBuscar" style="height:38px;">Buscar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table id="tableConexion">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th style="width:100px;">Fecha</th>
              <th style="width:100px;">Hora Inicio</th>
              <th style="width:100px;">Hora Fin</th>
              <th style="width:120px;">Sesión</th>
            </tr>
          </thead>
          <tbody id="conexionTbody">
            <tr><td colspan="7" style="text-align:center;padding:30px">Seleccione filtros y pulse Buscar</td></tr>
          </tbody>
        </table>
      </div>
      
      <div id="conexionPagination" class="pagination" style="display:none; justify-content:space-between; align-items:center; margin-top:20px;">
          <span class="page-info" id="conexionPageInfo">Página 1</span>
          <div>
            <button class="btn btn-secondary btn-sm" id="btnPrevConexion">Anterior</button>
            <button class="btn btn-secondary btn-sm" id="btnNextConexion">Siguiente</button>
          </div>
      </div>
    </div>
  `;

  await preloadUsers();
  await loadFilters();
  initDateRange();
  setupEvents();
}

async function preloadUsers() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    snap.forEach(d => {
      const data = d.data();
      usersCache[d.id] = {
        nombre: data.NOMBRE || data.nombre || 'N/A',
        cliente: data.CLIENTE || data.cliente || '',
        unidad: data.UNIDAD || data.unidad || ''
      };
    });

    const selU = document.getElementById('filtroConexionUsuario') as HTMLSelectElement;
    if (selU) {
      const userList = Object.entries(usersCache).map(([id, u]: [string, any]) => ({ id, nombre: u.nombre }));
      userList.sort((a, b) => a.nombre.localeCompare(b.nombre));
      selU.innerHTML = '<option value="">Todos los usuarios</option>' + userList.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    }
  } catch (e) { }
}

async function loadFilters() {
  const selC = document.getElementById('filtroConexionCliente') as HTMLSelectElement;
  const selU = document.getElementById('filtroConexionUnidad') as HTMLSelectElement;
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
  ($ as any)('#filtroConexionFecha').daterangepicker({
    locale: { format: 'DD/MM/YYYY', applyLabel: 'Aplicar', cancelLabel: 'Cancelar', daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'], monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] },
    startDate: moment().subtract(7, 'days'),
    endDate: moment(),
    autoUpdateInput: true
  });
}

function setupEvents() {
  const btnSearch = document.getElementById('btnConexionBuscar');
  const btnExport = document.getElementById('btnExportConexionExcel');
  const btnPrev = document.getElementById('btnPrevConexion') as HTMLButtonElement;
  const btnNext = document.getElementById('btnNextConexion') as HTMLButtonElement;

  btnSearch?.addEventListener('click', () => {
    currentPage = 1;
    fetchTiempos();
  });

  btnPrev?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTiempos(); }
  });

  btnNext?.addEventListener('click', () => {
    const total = Math.ceil(filteredConexions.length / ITEMS_PER_PAGE);
    if (currentPage < total) { currentPage++; renderTiempos(); }
  });

  btnExport?.addEventListener('click', exportToExcel);

  const btnPDF = document.getElementById('btnExportConexionPDF');
  btnPDF?.addEventListener('click', exportToPDFReport);
}

async function fetchTiempos() {
  const picker = ($ as any)('#filtroConexionFecha').data('daterangepicker');
  if (!picker) return;

  const cliSelect = document.getElementById('filtroConexionCliente') as HTMLSelectElement;
  const uniSelect = document.getElementById('filtroConexionUnidad') as HTMLSelectElement;
  const usrSelect = document.getElementById('filtroConexionUsuario') as HTMLSelectElement;

  const startDate = picker.startDate.toDate();
  const endDate = picker.endDate.toDate();
  endDate.setHours(23, 59, 59, 999);

  const clientVal = cliSelect.value;
  const unitVal = uniSelect.value;
  const userVal = usrSelect.value;

  UI.showLoader('Buscando...', 'Consultando tiempos de conexión', 20);

  try {
    let q = query(
      collection(db, COLLECTIONS.TIEMPO_CONEXION),
      limit(2000)
    );

    const snap = await getDocs(q);

    let rawRows = snap.docs.map(d => {
      const data = d.data() as any;

      // Inicio
      let hIn = new Date(0);
      if (data.horaInicio?.toDate) hIn = data.horaInicio.toDate();
      else if (data.horaInicio) hIn = new Date(data.horaInicio);

      // Fin
      let hOut: Date | null = null;
      const rawOut = data.horaCierre || data.horaFin;
      if (rawOut?.toDate) hOut = rawOut.toDate();
      else if (rawOut) hOut = new Date(rawOut);

      return { id: d.id, ...data, hIn, hOut };
    });

    // Filtrado Memoria
    rawRows = rawRows.filter(r => {
      const uData = usersCache[r.usuarioID || r.usuario] || {};
      const rCliente = r.cliente || uData.cliente || '';
      const rUnidad = r.unidad || uData.unidad || '';

      if (clientVal && rCliente !== clientVal) return false;
      if (unitVal && rUnidad !== unitVal) return false;
      if (userVal && (r.usuarioID !== userVal && r.usuario !== userVal)) return false;
      if (r.hIn < startDate || r.hIn > endDate) return false;
      return true;
    });

    // Ordenamiento
    rawRows.sort((a, b) => b.hIn.getTime() - a.hIn.getTime());

    allConexions = rawRows;
    filteredConexions = rawRows;

    renderTiempos();

  } catch (e) {
    console.error(e);
    UI.toast('Error al consultar tiempos', 'error');
  } finally {
    UI.hideLoader();
  }
}

function renderTiempos() {
  const tbody = document.getElementById('conexionTbody');
  const pagination = document.getElementById('conexionPagination');
  const info = document.getElementById('conexionPageInfo');
  const prev = document.getElementById('btnPrevConexion') as HTMLButtonElement;
  const next = document.getElementById('btnNextConexion') as HTMLButtonElement;
  if (!tbody || !pagination) return;

  if (filteredConexions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px">No se encontraron registros.</td></tr>';
    pagination.style.display = 'none';
    return;
  }

  pagination.style.display = 'flex';
  const totalPages = Math.ceil(filteredConexions.length / ITEMS_PER_PAGE);

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filteredConexions.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = paginated.map(r => {
    const uData = usersCache[r.usuarioID || r.usuario] || {};
    const nombre = r.nombreUsuario || uData.nombre || 'Desconocido';
    const cliente = r.cliente || uData.cliente || '';
    const unidad = r.unidad || uData.unidad || '';

    const fecha = r.hIn.toLocaleDateString('es-PE');
    const hInStr = r.hIn.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const hOutStr = r.hOut ? r.hOut.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '--:--';

    let duracion = '--';
    if (r.hOut) {
      const diff = r.hOut.getTime() - r.hIn.getTime();
      if (diff > 0) {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        duracion = hours > 0 ? `${hours}h ${mins}m` : (mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
      }
    }

    return `
            <tr>
                <td style="font-weight:500;">${nombre}</td>
                <td style="font-size:12px;">${cliente}</td>
                <td style="font-size:12px;">${unidad}</td>
                <td style="white-space:nowrap;">${fecha}</td>
                <td style="font-family:monospace;">${hInStr}</td>
                <td style="font-family:monospace;">${hOutStr}</td>
                <td style="text-align:right;"><span class="badge badge-info">${duracion}</span></td>
            </tr>
        `;
  }).join('');

  if (info) info.textContent = `Página ${currentPage} de ${totalPages} (${filteredConexions.length} en total)`;
  if (prev) prev.disabled = currentPage === 1;
  if (next) next.disabled = currentPage === totalPages;
}

function exportToExcel() {
  if (filteredConexions.length === 0) return UI.toast('Busque datos primero', 'warning');

  const ws_data = [
    ['LIDER CONTROL - CONTROL DE TIEMPOS DE CONEXIÓN'],
    [`Fecha Exportación: ${new Date().toLocaleString('es-PE')}`],
    [`Total Registros: ${filteredConexions.length}`],
    [],
    ['USUARIO', 'CLIENTE', 'UNIDAD', 'FECHA', 'HORA INICIO', 'HORA FIN', 'DURACIÓN']
  ];

  filteredConexions.forEach(r => {
    const uData = usersCache[r.usuarioID || r.usuario] || {};
    const nombre = r.nombreUsuario || uData.nombre || 'Desconocido';
    const cliente = r.cliente || uData.cliente || '';
    const unidad = r.unidad || uData.unidad || '';

    const fecha = r.hIn.toLocaleDateString('es-PE');
    const hInStr = r.hIn.toLocaleTimeString('es-PE');
    const hOutStr = r.hOut ? r.hOut.toLocaleTimeString('es-PE') : '--:--';

    let duracion = '--';
    if (r.hOut) {
      const diff = r.hOut.getTime() - r.hIn.getTime();
      if (diff > 0) {
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        duracion = `${hours}h ${mins}m`;
      }
    }

    ws_data.push([nombre, cliente, unidad, fecha, hInStr, hOutStr, duracion]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, 'Tiempos');
  XLSX.writeFile(wb, `TiemposConexion_${moment().format('YYYYMMDD_HHmm')}.xlsx`);
  UI.toast('Exportando Excel...');
}

async function exportToPDFReport() {
  if (filteredConexions.length === 0) return UI.toast('Busque datos primero', 'warning');

  UI.showLoader('Generando PDF...', 'Preparando reporte de Tiempos');

  try {
    const logo = await getLogoBase64();
    const tableData = filteredConexions.map(r => {
      const uData = usersCache[r.usuarioID || r.usuario] || {};
      const nombre = r.nombreUsuario || uData.nombre || 'Desconocido';
      const cliente = r.cliente || uData.cliente || '';
      const unidad = r.unidad || uData.unidad || '';

      const fecha = r.hIn.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const hInStr = r.hIn.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
      const hOutStr = r.hOut ? r.hOut.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';

      let duracion = '--';
      if (r.hOut) {
        const diff = r.hOut.getTime() - r.hIn.getTime();
        if (diff > 0) {
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          duracion = `${hours}h ${mins}m`;
        }
      }

      return [
        { text: nombre, fontSize: 8 },
        { text: cliente, fontSize: 8 },
        { text: unidad, fontSize: 8 },
        { text: fecha, fontSize: 8, alignment: 'center' },
        { text: hInStr, fontSize: 8, alignment: 'center' },
        { text: hOutStr, fontSize: 8, alignment: 'center' },
        { text: duracion, fontSize: 8, alignment: 'right' }
      ];
    });

    const docDef: any = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [30, 60, 30, 40],
      header: function (currentPage: number) {
        if (currentPage === 1) {
          return {
            columns: [
              logo ? { image: logo, width: 45, height: 45 } : { text: '' },
              {
                text: 'REPORTE DE TIEMPOS DE CONEXIÓN',
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
            widths: ['20%', '15%', '15%', '14%', '12%', '12%', '12%'],
            body: [
              [
                { text: 'USUARIO', style: 'tableHeader' },
                { text: 'CLIENTE', style: 'tableHeader' },
                { text: 'UNIDAD', style: 'tableHeader' },
                { text: 'FECHA', style: 'tableHeader' },
                { text: 'HORA INCIO', style: 'tableHeader' },
                { text: 'HORA FIN', style: 'tableHeader' },
                { text: 'DURACIÓN', style: 'tableHeader' }
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

    await pdfExportHelper(docDef, `TiemposConexion_${moment().format('YYYYMMDD_HHmm')}.pdf`);
    UI.toast('Reporte PDF generado');
  } catch (err) {
    console.error(err);
    UI.toast('Error al generar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}
