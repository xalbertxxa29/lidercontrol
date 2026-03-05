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

export async function initCrearQRView() {
  const container = document.getElementById('view-crear-qr');
  if (!container) return;

  if (container.innerHTML.trim() !== '' && document.getElementById('qr-main-container')) return;

  container.innerHTML = `
    <div class="page-head">
        <div>
            <h2>Generador de códigos QR</h2>
            <h4 class="muted">Configuración de puntos de control para rondas</h4>
        </div>
        <button class="btn btn-secondary" id="btnDescargarPdfQRs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
            Exportar Lista PDF
        </button>
    </div>

    <div id="qr-main-container" class="grid-2" style="gap: 30px;">
        <!-- Lado Izquierdo: Configuración -->
        <div class="card card-pad">
            <h3 class="mb-4">Configuración del Punto</h3>
            <form id="formQR" class="form-grid">
                
                <div class="form-group full">
                    <label>Cliente *</label>
                    <div id="selectClienteBtn" class="selector-btn">
                        <span id="labelCliente">Seleccionar Cliente...</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>

                <div class="form-group full">
                    <label>Unidad *</label>
                    <div id="selectUnidadBtn" class="selector-btn disabled">
                        <span id="labelUnidad">Seleccionar Cliente primero</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>

                <div class="form-group full">
                    <label>Nombre del Punto QR *</label>
                    <input type="text" id="qrFormNombre" class="form-input" placeholder="Ej: Puerta Principal, Almacén A" required>
                </div>

                <div class="form-group full flex items-center gap-3 py-3" style="background:rgba(255,255,255,0.03); border-radius:10px; padding: 12px 15px;">
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" id="qrFormReqPregunta">
                        <span class="slider round"></span>
                    </label>
                    <label for="qrFormReqPregunta" style="margin:0; cursor:pointer; font-weight:500;">Requiere respuesta al escanear</label>
                </div>

                <div id="qrOpcionesPregunta" style="display:none; background:rgba(255,255,255,0.02); padding:20px; border-radius:12px; border:1px dashed rgba(255,255,255,0.1); margin-bottom:16px;" class="form-group full">
                    <label class="mb-2 text-accent text-xs uppercase font-bold">Preguntas (Máximo 3)</label>
                    <div id="qrQuestionsList" class="flex flex-column gap-2 mb-3">
                        <!-- Preguntas dinámicas -->
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm w-full" id="btnAddQuestion">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="mr-1"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Agregar Pregunta
                    </button>
                </div>

                <div class="form-group full">
                    <label>Tamaño del QR (Píxeles)</label>
                    <div class="grid-2 gap-2">
                        <div>
                            <span class="text-[10px] muted uppercase">Ancho</span>
                            <input type="number" id="qrWide" class="form-input" value="200">
                        </div>
                        <div>
                            <span class="text-[10px] muted uppercase">Alto</span>
                            <input type="number" id="qrHigh" class="form-input" value="200">
                        </div>
                    </div>
                </div>

                <div class="form-group full">
                    <label>Coordenadas (Geolocalización)</label>
                    <div class="flex gap-2 mb-3">
                        <input type="text" id="qrLat" class="form-input" placeholder="Latitud" readonly style="background:rgba(255,255,255,0.05)">
                        <input type="text" id="qrLng" class="form-input" placeholder="Longitud" readonly style="background:rgba(255,255,255,0.05)">
                    </div>
                    <div id="qr-map-container" style="height:280px; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.05); margin-bottom:15px;"></div>
                    <button type="button" class="btn btn-secondary w-full" id="btnGeoActualQR">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        Usar ubicación actual
                    </button>
                </div>

                <button type="button" class="btn btn-primary w-full py-4 mt-4 shadow-2xl" id="btnGenerarQR">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" class="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><path d="M14 14h3v3h-3z"></path></svg>
                    VISUALIZAR Y GUARDAR QR
                </button>
            </form>
        </div>

        <!-- Columna Derecha: Vista Previa -->
        <div class="qr-preview-side sticky top-5">
            <div class="qr-card-preview p-8 text-center flex flex-column items-center justify-center h-full min-h-[500px]" style="background:rgba(255,255,255,0.02); border-radius:24px; border:1px solid rgba(255,255,255,0.05);">
                <div id="qrEmptyState" class="muted text-center max-w-[250px]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="60" class="mb-4 opacity-20"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z"></path></svg>
                    <p>Completa la configuración para generar la vista previa del código QR</p>
                </div>

                <div id="qrFullPreview" style="display:none; width:100%">
                    <h2 id="previewNombre" class="text-2xl font-bold mb-1 tracking-tight text-white">NOMBRE DEL PUNTO</h2>
                    <p id="previewDetalle" class="muted text-sm mb-8 uppercase tracking-widest opacity-60">CLIENTE | UNIDAD</p>
                    
                    <div class="qr-preview-box mx-auto shadow-2xl" style="background:white; padding:25px; border-radius:24px; width:fit-content; border:10px solid #f8fafc">
                        <canvas id="qrCanvas"></canvas>
                    </div>

                    <div class="mt-10 flex gap-3 justify-center">
                        <button id="btnConfirmarGuardarQR" class="btn btn-primary px-8 py-4" style="display:none; border-radius:15px; background:linear-gradient(135deg, var(--accent), #1e40af)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" class="mr-2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                            Confirmar Registro
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Sección de Registrados: Grid de Cards -->
    <div class="section shadow-lg mt-10">
        <div class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-500 rounded-lg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="20"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                </div>
                <h2 class="text-xl font-bold">📋 QRs Generados</h2>
            </div>
            <button class="btn btn-secondary text-sm px-5" id="btnDescargarPdfQRsSec">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Exportar Lista PDF
            </button>
        </div>

        <div class="filters-bar p-4 mb-6" style="background:rgba(255,255,255,0.02); border-radius:15px; border:1px solid rgba(255,255,255,0.05)">
            <div class="filter-group">
                <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Cliente</label>
                <div id="filterClienteBtn" class="selector-btn text-xs">
                    <span id="labelFilterCliente">Todos los Clientes</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="filter-group">
                <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Unidad</label>
                <div id="filterUnidadBtn" class="selector-btn text-xs disabled">
                    <span id="labelFilterUnidad">Todas las Unidades</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-primary text-sm px-6 h-[42px]" id="btnBuscarQRs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Buscar
                </button>
                <button class="btn btn-secondary text-sm px-4 h-[42px]" id="btnLimpiarFiltros">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
            </div>
        </div>

        <div id="qrCardsGrid" class="qr-grid">
            <div class="text-center py-12 muted w-full" style="grid-column: 1/-1;">
                <p>Selecciona filtros y haz clic en "Buscar" para ver los QRs generados</p>
            </div>
        </div>
    </div>

    <!-- Modal de Selección Genérico -->
    <div class="modal" id="selectorModal" aria-hidden="true">
        <div class="modal-box max-w-sm">
            <h3 id="selectorTitle" class="mb-4">Seleccionar</h3>
            <div class="search-box mb-4">
                <input type="text" id="selectorSearch" placeholder="Buscar..." class="form-input">
            </div>
            <div id="selectorList" class="list-group" style="max-height: 350px; overflow-y: auto;">
                <!-- Lista inyectada -->
            </div>
            <div class="modal-actions mt-4">
                <button type="button" class="btn secondary w-full" id="selectorCancel">Cerrar</button>
            </div>
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

async function openSelectorModal(title: string, items: string[], onSelect: (val: string) => void) {
  const modal = document.getElementById('selectorModal')!;
  const modalTitle = document.getElementById('selectorTitle')!;
  const listGroup = document.getElementById('selectorList')!;
  const searchInput = document.getElementById('selectorSearch') as HTMLInputElement;

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

  const btnCancel = document.getElementById('selectorCancel');
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

  btnFilterUnidad.onclick = () => {
    if (!selectedFilterCliente) return;
    openSelectorModal(`Unidades de ${selectedFilterCliente}`, ['Todas las Unidades', ...filterUnidades], (val) => {
      selectedFilterUnidad = val === 'Todas las Unidades' ? null : val;
      labelFilterUnidad.textContent = val;
    });
  };

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

        fetchQRs(selectedFilterCliente, selectedFilterUnidad);
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

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'qr-card-canvas';
    const canvas = document.createElement('canvas');
    canvasContainer.appendChild(canvas);

    card.innerHTML = `
            <div class="qr-card-canvas"></div>
            <div class="qr-card-info">
                <div class="qr-card-title">${qr.nombre || 'Sin Nombre'}</div>
                <div class="qr-card-subtitle">${qr.cliente || '?'} - ${qr.unidad || '?'}</div>
                <div class="text-[10px] muted mt-1">
                    ${qr.latitude ? qr.latitude.toFixed(4) : '0.0000'}, ${qr.longitude ? qr.longitude.toFixed(4) : '0.0000'}
                </div>
                ${qr.requireQuestion === 'si' ? '<span class="badge badge-info text-[9px] mt-1">REQUIERE RESPUESTA</span>' : ''}
            </div>
            <div class="qr-card-actions">
                <button class="btn btn-secondary text-[10px] py-2 btn-download-qr" data-id="${qr.id}">Descargar</button>
                <button class="btn btn-del-qr text-[10px] py-2" data-id="${qr.id}" style="background:#fee2e2; color:#ef4444; border:none">Eliminar</button>
            </div>
        `;

    const canvasDiv = card.querySelector('.qr-card-canvas')!;
    canvasDiv.appendChild(canvas);

    QRCode.toCanvas(canvas, qr.id, {
      width: 140,
      margin: 1,
      color: { dark: '#1e293b', light: '#ffffff' }
    });

    grid.appendChild(card);

    (card.querySelector('.btn-download-qr') as HTMLElement).onclick = () => {
      downloadSingleQR(qr);
    };

    (card.querySelector('.btn-del-qr') as HTMLElement).onclick = () => {
      UI.dialog('Eliminar QR', '¿Seguro de borrar este punto?', async () => {
        UI.showLoader('Borrando...', '');
        try {
          await deleteDoc(doc(db, COLLECTIONS.QR, qr.id));
          UI.toast('QR eliminado');
          fetchQRs();
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
