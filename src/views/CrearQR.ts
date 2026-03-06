import { UI } from '../ui';
import { db } from '../firebase';
import {
  collection, getDocs, doc, setDoc, deleteDoc, query, where, orderBy, limit
} from 'firebase/firestore';
import { accessControl } from '../access-control';
import * as L from 'leaflet';
// @ts-ignore
import QRCode from 'qrcode';
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
  QR: 'QR_CODES',
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

let map: L.Map | null = null;
let marker: L.Marker | null = null;
let qrList: any[] = [];
let generatedQRData: string | null = null;

// Estado de selección
let selectedCliente: string | null = null;
let selectedUnidad: string | null = null;
let cachedClientes: string[] = [];
let cachedUnidades: string[] = [];

// Estado de selección historial
let selectedFilterCliente: string | null = null;
let selectedFilterUnidad: string | null = null;
let filterUnidades: string[] = [];

export async function initCrearQRView() {
  const container = document.getElementById('view-crear-qr');
  if (!container) return;

  if (container.innerHTML.trim() !== '' && document.getElementById('qr-main-container')) return;

  container.innerHTML = `
    <div class="fade-in px-4 py-6">
        <div class="g-flex g-items-center g-gap-4 g-mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" width="24" class="opacity-80">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z"></path>
            </svg>
            <div>
                <h2 class="text-2xl font-bold tracking-tight text-white m-0">Generador de códigos QR</h2>
                <h4 class="text-xs muted uppercase tracking-widest font-medium opacity-60 m-0 mt-1">Configura puntos de control interactivos</h4>
            </div>
            <div class="ml-auto g-flex g-gap-2">
                <button class="btn btn-secondary btn-sm" id="btnDescargarPdfQRs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
                    Exportar Lista PDF
                </button>
            </div>
        </div>

        <div id="qr-main-container" class="ronda-main-grid">
            <!-- Lado Izquierdo: Formulario de Pasos -->
            <div class="ronda-form-side">
                <form id="formQR" autocomplete="off">
                    
                    <!-- PASO 1: UBICACIÓN -->
                    <div class="step-container-modern fade-in">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 1</span>
                            <span class="step-title">Ubicación Cliente</span>
                        </div>
                        <div class="g-grid g-cols-2 g-gap-4">
                            <div>
                                <label class="text-[10px] muted uppercase font-bold g-mb-1 block">Cliente *</label>
                                <div id="selectClienteBtn" class="custom-select-button">
                                    <span id="labelCliente">Seleccionar Cliente...</span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] muted uppercase font-bold g-mb-1 block">Unidad *</label>
                                <div id="selectUnidadBtn" class="custom-select-button disabled">
                                    <span id="labelUnidad">Seleccionar Cliente primero</span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- PASO 2: INFORMACIÓN Y PREGUNTAS -->
                    <div class="step-container-modern fade-in">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 2</span>
                            <span class="step-title">Información del QR</span>
                        </div>
                        <div class="g-mb-4">
                            <label class="text-[10px] muted uppercase font-bold g-mb-1 block">Nombre del Punto QR *</label>
                            <input type="text" id="qrFormNombre" class="custom-input-modern" placeholder="Ej: Puerta Principal, Almacén A" required>
                        </div>

                        <div class="flex items-center gap-3 py-3 px-4 mb-4" style="background:rgba(0, 240, 255, 0.05); border:1px solid var(--accent); border-radius:12px;">
                            <label class="switch" style="margin:0;">
                                <input type="checkbox" id="qrFormReqPregunta">
                                <span class="slider round" style="background-color: var(--bg); border: 1px solid rgba(255,255,255,0.2);"></span>
                            </label>
                            <label for="qrFormReqPregunta" class="mb-0 cursor-pointer font-bold text-sm text-white">¿Requiere respuesta al escanear?</label>
                        </div>

                        <div id="qrOpcionesPregunta" style="display:none; background:rgba(255,255,255,0.02); padding:20px; border-radius:12px; border:1px dashed rgba(255,255,255,0.15);" class="mb-2 transition-all">
                            <label class="mb-3 text-accent text-xs uppercase font-bold flex items-center gap-2">
                                <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                Preguntas (Máximo 3)
                            </label>
                            <div id="qrQuestionsList" class="flex flex-column gap-3 mb-4">
                                <!-- Preguntas dinámicas inyectadas por JS -->
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm w-full" id="btnAddQuestion" style="background: rgba(255,255,255,0.05)">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="mr-1"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                Añadir Pregunta
                            </button>
                        </div>
                    </div>

                    <!-- PASO 3: GEOLOCALIZACIÓN Y TAMAÑO -->
                    <div class="step-container-modern fade-in">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 3</span>
                            <span class="step-title">Geolocalización & Formato</span>
                        </div>
                        
                        <div class="g-mb-4">
                            <div class="flex gap-2 mb-3">
                                <input type="text" id="qrLat" class="custom-input-modern text-xs text-center" placeholder="Latitud" readonly>
                                <input type="text" id="qrLng" class="custom-input-modern text-xs text-center" placeholder="Longitud" readonly>
                                <button type="button" class="btn btn-secondary px-3" id="btnGeoActualQR" title="Ubicación Actual">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" width="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                </button>
                            </div>
                            <div id="qr-map-container" style="height:220px; border-radius:12px; border:1px solid rgba(255,255,255,0.15); box-shadow: 0 4px 15px rgba(0,0,0,0.3); overflow:hidden;"></div>
                        </div>

                        <div class="g-grid g-cols-2 g-gap-4">
                            <div>
                                <label class="text-[10px] muted uppercase font-bold g-mb-1 block">Ancho Impresión (px)</label>
                                <input type="number" id="qrWide" class="custom-input-modern" value="200">
                            </div>
                            <div>
                                <label class="text-[10px] muted uppercase font-bold g-mb-1 block">Alto Impresión (px)</label>
                                <input type="number" id="qrHigh" class="custom-input-modern" value="200">
                            </div>
                        </div>
                    </div>

                    <div class="g-flex g-gap-4 g-mt-6">
                        <button type="button" class="btn btn-secondary px-6" id="btnLimpiarFormQR">Limpiar</button>
                        <button type="button" class="btn btn-primary flex-1 shadow-lg h-[48px]" style="background:var(--accent); color:var(--bg); font-weight:800; font-size:14px; letter-spacing:1px;" id="btnGenerarQR">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" class="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><path d="M14 14h3v3h-3z"></path></svg>
                            GENERAR VISTA PREVIA
                        </button>
                    </div>
                </form>
            </div>

            <!-- Columna Derecha: Vista Previa y Registro -->
            <div class="ronda-qr-side">
                <div class="step-container-modern sticky top-5" style="border-width: 2px; border-color: rgba(255,255,255,0.08); background:rgba(0,0,0,0.2);">
                    <div class="qr-sidebar-header g-mb-4">
                        <div class="g-flex g-items-center g-gap-3">
                            <div class="qr-checkbox-modern" style="border-radius: 4px; border:none; background: var(--accent);">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </div>
                            <h3 class="text-sm font-bold text-white tracking-wide">Vista Previa Registrada</h3>
                        </div>
                    </div>

                    <div class="qr-card-preview p-4 flex flex-col items-center justify-center min-h-[350px]">
                        <div id="qrEmptyState" class="muted text-center max-w-[200px] slide-up">
                            <div class="text-5xl mb-4 opacity-30 grayscale">🧾</div>
                            <p class="text-[10px] uppercase tracking-widest font-bold">Completa los 3 pasos para observar la previsualización</p>
                        </div>

                        <div id="qrFullPreview" style="display:none; width:100%" class="fade-in">
                            <h2 id="previewNombre" class="text-xl font-bold mb-0 text-white text-center">NOMBRE PUNTO</h2>
                            <p id="previewDetalle" class="muted text-[10px] mb-6 uppercase tracking-widest opacity-80 text-center">CLIENTE | UNIDAD</p>
                            
                            <div class="qr-preview-box mx-auto shadow-2xl" style="background:white; padding:15px; border-radius:18px; width:fit-content; border:6px solid #f8fafc; transition:transform 0.3s ease;">
                                <canvas id="qrCanvas"></canvas>
                            </div>

                            <button id="btnConfirmarGuardarQR" class="btn btn-primary w-full mt-8 h-[48px]" style="background:linear-gradient(135deg, #10b981, #059669); border:none; box-shadow:0 10px 20px rgba(16, 185, 129, 0.3);">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" class="mr-2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                GUARDAR PUNTO QR
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección Historial -->
        <div class="historial-title-area mt-12">
            <div class="g-flex g-justify-between g-items-center g-mb-4">
                <div>
                    <h3 class="text-lg font-bold text-white">Directorio de Códigos QR</h3>
                    <p class="text-[10px] muted uppercase tracking-widest font-medium opacity-50">Gestiona y exporta los códigos QR generados previamente</p>
                </div>
                <button class="btn btn-secondary btn-sm" id="btnDescargarPdfQRsSec">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Exportar Lista
                </button>
            </div>
            
            <div class="filters-bar p-4 mb-6" style="background:rgba(255,255,255,0.04); border-radius:15px; border:1px solid rgba(255,255,255,0.15)">
                <div class="g-flex g-gap-4 g-items-end g-w-full">
                    <div class="filter-group flex-1">
                        <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Cliente</label>
                        <div id="filterClienteBtn" class="selector-btn text-xs" style="background: rgba(15, 23, 42, 0.4); border:1px solid rgba(255,255,255,0.2);">
                            <span id="labelFilterCliente">Todos los Clientes</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="filter-group flex-1">
                        <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Unidad</label>
                        <div id="filterUnidadBtn" class="selector-btn text-xs disabled" style="background: rgba(15, 23, 42, 0.4); border:1px solid rgba(255,255,255,0.2);">
                            <span id="labelFilterUnidad">Todas las Unidades</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="g-flex g-gap-2">
                        <button class="btn btn-primary text-sm px-6 h-[42px]" id="btnBuscarQRs">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary text-sm px-4 h-[42px]" id="btnLimpiarFiltros">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div id="qrCardsGrid" class="historial-grid-modern">
                <div class="col-span-full py-12 text-center text-muted border-2 border-dashed border-white/5 rounded-2xl">
                    Selecciona filtros y haz clic en "Buscar" para listar
                </div>
            </div>
        </div>
    </div>

    <!-- Modal de Selección Genérico para QR -->
    <div class="modal selector-modal" id="selectorModalQR" aria-hidden="true">
        <div class="modal-box glass-card max-w-sm" style="border-color: rgba(0, 240, 255, 0.2);">
            <div class="g-flex g-items-center g-justify-between g-mb-4">
                <h3 id="selectorTitleQR" class="text-white font-bold text-lg">Seleccionar</h3>
                <button type="button" class="btn btn-sm btn-secondary p-1" id="selectorCancelBtnQR">
                   ✕
                </button>
            </div>
            <div class="search-box g-mb-4 relative">
                <input type="text" id="selectorSearchQR" placeholder="Escribe para buscar..." class="custom-input-modern g-w-full">
            </div>
            <div id="selectorListQR" class="selector-list-container custom-scrollbar"></div>
        </div>
    </div>

    <!-- Modal Tamaño PDF -->
    <div class="modal" id="pdfSizeModal" aria-hidden="true">
        <div class="modal-box max-w-xs">
            <h3 class="font-bold text-lg mb-4">Tamaño de QR para Descarga</h3>
            <div class="form-group mb-4">
                <label class="text-sm">Ancho (píxeles):</label>
                <input type="number" id="pdfQrWidth" class="form-input" value="80" min="40" max="250">
                <small class="muted">Rango: 40 - 250px</small>
            </div>
            <div class="form-group mb-6">
                <label class="text-sm">Alto (píxeles):</label>
                <input type="number" id="pdfQrHeight" class="form-input" value="80" min="40" max="250">
                <small class="muted">Rango: 40 - 250px</small>
            </div>
            <div class="flex gap-2">
                <button type="button" class="btn secondary flex-1" id="btnCancelPdfSize">Cancelar</button>
                <button type="button" class="btn btn-primary flex-1" id="btnConfirmPdfDownload">Descargar PDF</button>
            </div>
        </div>
    </div>
    `;

  await preloadData();
  initMap();
  setupEventListeners();
  // fetchQRs(); // ELIMINADO: ahora la carga es manual con el botón Buscar
}

async function preloadData() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.CLIENT_UNITS));
    cachedClientes = snap.docs.map(d => d.id).sort();
  } catch (e) { console.error(e); }
}

// Helpers para Selectores
async function openSelectorModal(title: string, items: string[], onSelect: (val: string) => void) {
  const modal = document.getElementById('selectorModalQR')!;
  const modalTitle = document.getElementById('selectorTitleQR')!;
  const listGroup = document.getElementById('selectorListQR')!;
  const searchInput = document.getElementById('selectorSearchQR') as HTMLInputElement;

  modalTitle.textContent = title;
  searchInput.value = '';

  const render = (filteredItems: string[]) => {
    listGroup.innerHTML = '';
    if (filteredItems.length === 0) {
      listGroup.innerHTML = '<div class="muted-text">Sin resultados</div>';
      return;
    }
    filteredItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item p-3 cursor-pointer';
      div.textContent = item;
      div.onclick = () => {
        onSelect(item);
        modal.classList.remove('show');
      };
      listGroup.appendChild(div);
    });
  };

  render(items);

  searchInput.oninput = () => {
    const term = searchInput.value.toLowerCase();
    render(items.filter(i => i.toLowerCase().includes(term)));
  };

  modal.classList.add('show');
  setTimeout(() => searchInput.focus(), 100);

  const btnCancel = document.getElementById('selectorCancelBtnQR');
  if (btnCancel) btnCancel.onclick = () => modal.classList.remove('show');
}

function initMap() {
  const defLat = -12.046374;
  const defLng = -77.042793;

  map = L.map('qr-map-container').setView([defLat, defLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  marker = L.marker([defLat, defLng], { draggable: true }).addTo(map);

  marker.on('dragend', () => {
    const pos = marker!.getLatLng();
    updateCoords(pos.lat, pos.lng);
  });

  map.on('click', (e: any) => {
    marker!.setLatLng(e.latlng);
    updateCoords(e.latlng.lat, e.latlng.lng);
  });

  updateCoords(defLat, defLng);
}

function updateCoords(lat: number, lng: number) {
  (document.getElementById('qrLat') as HTMLInputElement).value = lat.toFixed(6);
  (document.getElementById('qrLng') as HTMLInputElement).value = lng.toFixed(6);
}

function setupEventListeners() {
  const btnCliente = document.getElementById('selectClienteBtn')!;
  const btnUnidad = document.getElementById('selectUnidadBtn')!;
  const labelCliente = document.getElementById('labelCliente')!;
  const labelUnidad = document.getElementById('labelUnidad')!;

  btnCliente.onclick = () => {
    openSelectorModal('Seleccionar Cliente', cachedClientes, (val) => {
      selectedCliente = val;
      labelCliente.textContent = val;
      labelCliente.classList.add('font-bold');
      selectedUnidad = null;
      labelUnidad.textContent = 'Seleccionar Unidad...';
      labelUnidad.classList.remove('font-bold');
      btnUnidad.classList.remove('disabled');
      loadUnidades(val);
    });
  };

  btnUnidad.onclick = () => {
    if (!selectedCliente) return;
    openSelectorModal(`Unidades de ${selectedCliente}`, cachedUnidades, (val) => {
      selectedUnidad = val;
      labelUnidad.textContent = val;
      labelUnidad.classList.add('font-bold');
    });
  };

  // Filtros de la lista Generados
  const btnFilterCliente = document.getElementById('filterClienteBtn')!;
  const btnFilterUnidad = document.getElementById('filterUnidadBtn')!;
  const labelFilterCliente = document.getElementById('labelFilterCliente')!;
  const labelFilterUnidad = document.getElementById('labelFilterUnidad')!;
  let selectedFilterCliente: string | null = null;
  let selectedFilterUnidad: string | null = null;
  let filterUnidades: string[] = [];

  btnFilterCliente.onclick = () => {
    openSelectorModal('Filtrar por Cliente', ['Todos los Clientes', ...cachedClientes], (val) => {
      if (val === 'Todos los Clientes') {
        selectedFilterCliente = null;
        labelFilterCliente.textContent = 'Todos los Clientes';
        btnFilterUnidad.classList.add('disabled');
      } else {
        selectedFilterCliente = val;
        labelFilterCliente.textContent = val;
        btnFilterUnidad.classList.remove('disabled');
        loadFilterUnidades(val);
      }
      selectedFilterUnidad = null;
      labelFilterUnidad.textContent = 'Todas las Unidades';
    });
  };

  btnFilterUnidad.addEventListener('click', () => {
    if (!selectedFilterCliente) return;

    openSelectorModal(`Unidades de ${selectedFilterCliente}`, ['Todas las Unidades', ...filterUnidades], (val) => {
      if (val === 'Todas las Unidades') {
        selectedFilterUnidad = null;
        labelFilterUnidad.textContent = 'Todas las Unidades';
      } else {
        selectedFilterUnidad = val;
        labelFilterUnidad.textContent = val;
        fetchQRs(selectedFilterCliente, selectedFilterUnidad); // AUTO-LOAD
      }
    });
  });

  async function loadFilterUnidades(clienteId: string) {
    try {
      const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${clienteId}/UNIDADES`));
      filterUnidades = snap.docs.map(d => d.id).sort();
    } catch (e) { filterUnidades = []; }
  }

  async function loadUnidades(clienteId: string) {
    try {
      const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${clienteId}/UNIDADES`));
      cachedUnidades = snap.docs.map(d => d.id).sort();
    } catch (e) { cachedUnidades = []; }
  }

  // Switch de preguntas y lista dinámica
  const chkPregunta = document.getElementById('qrFormReqPregunta') as HTMLInputElement;
  const divPregunta = document.getElementById('qrOpcionesPregunta');
  const questionsList = document.getElementById('qrQuestionsList')!;
  const btnAddQuestion = document.getElementById('btnAddQuestion')!;

  const addQuestionInput = (val = '') => {
    const children = questionsList.children.length;
    if (children >= 3) return;

    const div = document.createElement('div');
    div.className = 'flex gap-2 mb-2';
    div.innerHTML = `
          <input type="text" class="form-input question-input" placeholder="Pregunta ${children + 1}" value="${val}">
          <button type="button" class="btn btn-del-question bg-red-900/20 text-red-500 border-none p-2" style="min-width:38px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      `;
    (div.querySelector('.btn-del-question')! as HTMLElement).onclick = () => {
      div.remove();
      updateAddButtonState();
    };
    questionsList.appendChild(div);
    updateAddButtonState();
  };

  const updateAddButtonState = () => {
    if (questionsList.children.length >= 3) {
      (btnAddQuestion as HTMLButtonElement).disabled = true;
      btnAddQuestion.classList.add('opacity-50', 'pointer-events-none');
    } else {
      (btnAddQuestion as HTMLButtonElement).disabled = false;
      btnAddQuestion.classList.remove('opacity-50', 'pointer-events-none');
    }
  };

  if (chkPregunta) {
    chkPregunta.addEventListener('change', () => {
      const isChecked = chkPregunta.checked;
      if (divPregunta) divPregunta.style.display = isChecked ? 'block' : 'none';
      if (isChecked && questionsList.children.length === 0) {
        addQuestionInput();
      }
      if (!isChecked) {
        questionsList.innerHTML = '';
        updateAddButtonState();
      }
    });
  }

  if (btnAddQuestion) {
    btnAddQuestion.onclick = () => addQuestionInput();
  }

  // Geolocalización
  const btnGeo = document.getElementById('btnGeoActualQR');
  if (btnGeo) {
    btnGeo.onclick = () => {
      if ("geolocation" in navigator) {
        UI.showLoader('Obteniendo ubicación...', 'Por favor espera');
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          marker?.setLatLng([latitude, longitude]);
          map?.setView([latitude, longitude], 16);
          updateCoords(latitude, longitude);
          UI.hideLoader();
        }, () => {
          UI.hideLoader();
          UI.toast('No se pudo obtener la ubicación', 'error');
        });
      }
    };
  }

  // Generar y Guardar
  const inputNombre = document.getElementById('qrFormNombre') as HTMLInputElement;
  const btnGen = document.getElementById('btnGenerarQR');
  const btnSave = document.getElementById('btnConfirmarGuardarQR');
  const emptyPreview = document.getElementById('qrEmptyState')!;
  const fullPreview = document.getElementById('qrFullPreview')!;

  if (btnGen) {
    btnGen.onclick = async () => {
      const name = inputNombre.value.trim();
      if (!name || !selectedCliente || !selectedUnidad) return UI.toast('Faltan campos (Cliente, Unidad y Nombre)', 'warning');

      const tempId = `QR_${Date.now()}`;
      generatedQRData = tempId;

      UI.showLoader('Generando QR...', '');
      try {
        const canvas = document.getElementById('qrCanvas') as HTMLCanvasElement;
        await QRCode.toCanvas(canvas, tempId, {
          width: 300,
          margin: 2,
          color: { dark: '#1e293b', light: '#ffffff' },
          errorCorrectionLevel: 'H'
        });

        document.getElementById('previewNombre')!.textContent = name.toUpperCase();
        document.getElementById('previewDetalle')!.textContent = `${selectedCliente} | ${selectedUnidad}`;

        emptyPreview.style.display = 'none';
        fullPreview.style.display = 'block';
        if (btnSave) btnSave.style.display = 'flex';
        UI.toast('Vista previa generada. Confirme para guardar.', 'success');
      } catch (err) {
        UI.toast('Error al generar QR', 'error');
      } finally { UI.hideLoader(); }
    };
  }

  if (btnSave) {
    btnSave.onclick = async () => {
      if (!generatedQRData || !selectedCliente || !selectedUnidad) return;

      const name = inputNombre.value.trim();
      const lat = parseFloat((document.getElementById('qrLat') as HTMLInputElement).value);
      const lng = parseFloat((document.getElementById('qrLng') as HTMLInputElement).value);
      const qWide = parseInt((document.getElementById('qrWide') as HTMLInputElement).value) || 200;
      const qHigh = parseInt((document.getElementById('qrHigh') as HTMLInputElement).value) || 200;
      const reqQ = (document.getElementById('qrFormReqPregunta') as HTMLInputElement).checked;

      const qrData: any = {
        id: generatedQRData,
        nombre: name,
        cliente: selectedCliente,
        unidad: selectedUnidad,
        latitude: lat,
        longitude: lng,
        width: qWide,
        height: qHigh,
        requireQuestion: reqQ, // Guardar como BOOLEAN igual que webantigua
        createdAt: new Date().toISOString()
      };

      if (reqQ) {
        const inputs = document.querySelectorAll('.question-input') as NodeListOf<HTMLInputElement>;
        qrData.questions = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== '');
      } else {
        qrData.questions = [];
      }

      UI.showLoader('Guardando...', 'Registrando punto en base de datos');
      try {
        await setDoc(doc(db, COLLECTIONS.QR, generatedQRData), qrData);
        UI.toast('Punto QR registrado con éxito');
        btnSave.style.display = 'none';
        fullPreview.style.display = 'none';
        emptyPreview.style.display = 'block';
        inputNombre.value = '';
        // Limpiar dinámicos
        questionsList.innerHTML = '';
        chkPregunta.checked = false;
        if (divPregunta) divPregunta.style.display = 'none';

        // fetchQRs(selectedFilterCliente, selectedFilterUnidad); // REMOVED BY USER REQUEST
      } catch (e) { UI.toast('Error al registrar QR', 'error'); }
      finally { UI.hideLoader(); }
    };
  }

  // Filtros de búsqueda
  document.getElementById('btnBuscarQRs')!.onclick = () => {
    fetchQRs(selectedFilterCliente, selectedFilterUnidad);
  };

  document.getElementById('btnLimpiarFiltros')!.onclick = () => {
    selectedFilterCliente = null;
    selectedFilterUnidad = null;
    labelFilterCliente.textContent = 'Todos los Clientes';
    btnFilterUnidad.classList.add('disabled');

    // Al limpiar, vaciamos la lista y mostramos el mensaje inicial
    qrList = [];
    const grid = document.getElementById('qrCardsGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="text-center py-12 muted w-full" style="grid-column: 1/-1;">
          <p>Selecciona filtros y haz clic en "Buscar" para ver los QRs generados</p>
        </div>
      `;
    }
  };

  // PDF Export
  const pdfModal = document.getElementById('pdfSizeModal')!;
  const openPdfModal = () => {
    if (qrList.length === 0) return UI.toast('No hay datos para exportar', 'warning');
    pdfModal.classList.add('show');
  };

  const btnPdf1 = document.getElementById('btnDescargarPdfQRs');
  if (btnPdf1) (btnPdf1 as HTMLElement).onclick = openPdfModal;

  const btnPdf2 = document.getElementById('btnDescargarPdfQRsSec');
  if (btnPdf2) (btnPdf2 as HTMLElement).onclick = openPdfModal;

  (document.getElementById('btnCancelPdfSize') as HTMLElement).onclick = () => pdfModal.classList.remove('show');

  (document.getElementById('btnConfirmPdfDownload') as HTMLElement).onclick = () => {
    const w = parseInt((document.getElementById('pdfQrWidth') as HTMLInputElement).value) || 80;
    const h = parseInt((document.getElementById('pdfQrHeight') as HTMLInputElement).value) || 80;
    pdfModal.classList.remove('show');
    exportToPDF(w, h);
  };
}

async function fetchQRs(cliente?: string | null, unidad?: string | null) {
  const grid = document.getElementById('qrCardsGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="text-center py-12 w-full muted" style="grid-column: 1/-1;">Buscando puntos...</div>';

  try {
    let q;
    const coll = collection(db, COLLECTIONS.QR);

    if (cliente && unidad) {
      q = query(coll, where('cliente', '==', cliente), where('unidad', '==', unidad));
    } else if (cliente) {
      q = query(coll, where('cliente', '==', cliente));
    } else {
      // Sin filtros, podemos usar orderBy si hay pocos datos o índice simple
      q = query(coll, orderBy('createdAt', 'desc'), limit(50));
    }

    const snap = await getDocs(q);
    qrList = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    // Ordenar en memoria por fecha (descendente)
    qrList.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    renderQRCards();
  } catch (e) {
    console.error("Firestore Query Error:", e);
    grid.innerHTML = '<div class="text-center py-12 w-full error-text" style="grid-column: 1/-1;">Error al cargar datos</div>';
  }
}

function renderQRCards() {
  const grid = document.getElementById('qrCardsGrid');
  if (!grid) return;

  if (qrList.length === 0) {
    grid.innerHTML = '<div class="text-center py-12 w-full muted" style="grid-column: 1/-1;">No se encontraron resultados</div>';
    return;
  }

  grid.innerHTML = '';
  qrList.forEach(qr => {
    const card = document.createElement('div');
    card.className = 'qr-card';

    card.innerHTML = `
      <!-- Header -->
      <div class="ronda-card-header g-flex g-justify-between g-items-start">
        <div style="max-width: 75%">
          ${(qr.requireQuestion === true || qr.requireQuestion === 'si') ? '<div class="step-badge mb-2" style="background:var(--accent); font-size:8px; display:inline-block;">PREGUNTA ACTIVA</div>' : ''}
          <h4 class="text-white font-bold tracking-wide text-sm m-0" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${qr.nombre || 'Sin Nombre'}
          </h4>
          <p class="muted text-[10px] m-0 uppercase mt-1 opacity-70 truncate">
            ${qr.cliente || '?'} | ${qr.unidad || '?'}
          </p>
        </div>
      </div>
      
      <!-- Body (Canvas) -->
      <div class="ronda-card-body flex justify-center items-center py-6" style="background:rgba(0,0,0,0.2)">
        <div class="bg-white p-3 rounded-xl shadow-lg" style="border:4px solid #f8fafc">
           <canvas class="qr-card-canvas-element"></canvas>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="ronda-card-footer g-flex g-justify-between g-items-center">
        <div class="text-[9px] muted uppercase tracking-widest leading-relaxed">
          <span class="block text-white mb-0.5">DIMENSIÓN: ${qr.width || 200}x${qr.height || 200}</span>
          <span>LAT: ${qr.latitude?.toFixed(4) || 'N/A'}</span><br>
          <span>LNG: ${qr.longitude?.toFixed(4) || 'N/A'}</span>
        </div>
        <div class="g-flex g-gap-2">
          <button class="btn btn-primary btn-sm px-3 btn-download-qr" title="Descargar QR">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="btn btn-secondary btn-sm px-3 btn-del-qr" style="background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.2);" title="Eliminar QR">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);

    const canvas = card.querySelector('.qr-card-canvas-element') as HTMLCanvasElement;
    if (canvas) {
      QRCode.toCanvas(canvas, qr.id, {
        width: 140,
        margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' }
      });
    }

    (card.querySelector('.btn-download-qr') as HTMLElement).onclick = () => {
      downloadSingleQR(qr);
    };

    (card.querySelector('.btn-del-qr') as HTMLElement).onclick = () => {
      UI.dialog('Eliminar QR', '¿Seguro de borrar este punto?', async () => {
        UI.showLoader('Borrando...', '');
        try {
          await deleteDoc(doc(db, COLLECTIONS.QR, qr.id));
          UI.toast('QR eliminado');
          fetchQRs(selectedFilterCliente, selectedFilterUnidad);
        } catch (e) { UI.toast('Error al borrar', 'error'); }
        finally { UI.hideLoader(); }
      }, 'danger');
    };
  });
}

function downloadSingleQR(qr: any) {
  const canvas = document.createElement('canvas');
  QRCode.toCanvas(canvas, qr.id, {
    width: 256,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  }, (err) => {
    if (err) return UI.toast('Error al generar PDF', 'error');
    const img = canvas.toDataURL('image/png');

    const docDef = {
      content: [
        { text: 'PUNTO DE CONTROL QR', fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 20] },
        { text: `Nombre: ${qr.nombre}`, fontSize: 12, margin: [0, 0, 0, 5] },
        { text: `Cliente: ${qr.cliente}`, fontSize: 10 },
        { text: `Unidad: ${qr.unidad}`, fontSize: 10, margin: [0, 0, 0, 10] },
        { image: img, width: 200, alignment: 'center', margin: [0, 20, 0, 20] },
        { text: `Coordenadas: ${qr.latitude}, ${qr.longitude}`, fontSize: 8, color: '#666', alignment: 'center' }
      ]
    };
    pdfMake.createPdf(docDef).download(`QR_${qr.nombre}.pdf`);
  });
}

async function exportToPDF(qrW: number, qrH: number) {
  UI.showLoader('Generando PDF...', 'Por favor espera');

  try {
    const docContent: any[] = [
      { text: 'Reporte de Códigos QR', fontSize: 20, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      { text: `Total de QRs: ${qrList.length} | Generado: ${new Date().toLocaleString()}`, fontSize: 10, color: '#666', alignment: 'center', margin: [0, 0, 0, 20] }
    ];

    const body: any[] = [];
    let currentRow: any[] = [];
    const columns = 4;

    for (let i = 0; i < qrList.length; i++) {
      const qr = qrList[i];
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, qr.id, { width: 200, margin: 1 });
      const imgData = canvas.toDataURL('image/png');

      currentRow.push({
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: qr.nombre || 'Sin Nombre', fontSize: 9, bold: true, alignment: 'center', margin: [0, 2, 0, 2] },
                  { image: imgData, width: qrW, height: qrH, alignment: 'center', margin: [0, 0, 0, 2] }
                ],
                alignment: 'center',
                margin: [5, 5, 5, 5]
              }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => 'black',
          vLineColor: () => 'black'
        },
        margin: [5, 5, 5, 5]
      });

      if (currentRow.length === columns) {
        body.push(currentRow);
        currentRow = [];
      }
    }

    if (currentRow.length > 0) {
      while (currentRow.length < columns) {
        currentRow.push({ text: '', border: [false, false, false, false] });
      }
      body.push(currentRow);
    }

    docContent.push({
      table: {
        headerRows: 0,
        widths: ['25%', '25%', '25%', '25%'],
        body: body
      },
      layout: 'noBorders'
    });

    const docDefinition = {
      content: docContent,
      pageSize: 'A4',
      pageMargins: [20, 20, 20, 20]
    };

    pdfMake.createPdf(docDefinition).download(`QRs_LiderControl_${Date.now()}.pdf`);
    UI.toast('PDF generado con éxito', 'success');
  } catch (e) {
    UI.toast('Error al generar PDF', 'error');
  } finally {
    UI.hideLoader();
  }
}
