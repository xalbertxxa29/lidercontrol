import { UI } from '../ui';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where, orderBy, serverTimestamp, limit } from 'firebase/firestore';
import { accessControl } from '../access-control';

const COLLECTIONS = {
  RONDAS: 'Rondas_QR',
  QR: 'QR_CODES',
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

let rondasList: any[] = [];
let availableQRs: any[] = [];
let cachedClientes: string[] = [];
let cachedUnidades: string[] = [];
let selectedCliente: string | null = null;
let selectedUnidad: string | null = null;
let selectedFilterCliente: string | null = null;
let selectedFilterUnidad: string | null = null;
let filterUnidades: string[] = [];

export async function initCrearRondasView() {
  const container = document.getElementById('view-crear-rondas');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Gestión de Rondas</h2>
        <h4 class="muted">Configura las secuencias y horarios de las rondas operativas</h4>
      </div>
    </div>

    <div class="grid-2">
      <!-- Formulario de Creación -->
      <div class="card card-pad glass-card">
        <h3 class="mb-6">Crear Nueva Ronda</h3>
        <form id="formRonda">
          
          <!-- Paso 1: Ubicación -->
          <div class="mb-8">
            <div class="step-indicator">
              <div class="step-number">1</div>
              <div class="step-text">Ubicación y Puntos QR</div>
            </div>
            <div class="form-grid g2">
              <div class="form-group">
                <label class="text-[10px] muted uppercase mb-1 block">Cliente *</label>
                <button type="button" class="custom-select-button w-full text-left flex justify-between items-center" id="selectRondaClienteBtn">
                    <span id="labelRondaCliente">Seleccionar Cliente...</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
              <div class="form-group">
                <label class="text-[10px] muted uppercase mb-1 block">Unidad *</label>
                <button type="button" class="custom-select-button w-full text-left flex justify-between items-center disabled" id="selectRondaUnidadBtn">
                    <span id="labelRondaUnidad">Seleccionar Unidad...</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
              <div class="form-group full">
                <button type="button" class="btn btn-secondary btn-sm w-full py-3" id="btnRondaLoadQR">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Cargar Puntos QR Disponibles
                </button>
              </div>
            </div>
          </div>

          <!-- Paso 2: Información Básica -->
          <div class="mb-8">
            <div class="step-indicator">
              <div class="step-number">2</div>
              <div class="step-text">Detalles de la Ronda</div>
            </div>
            <div class="form-grid">
              <div class="form-group full">
                <label class="text-[10px] muted uppercase mb-1 block">Nombre de la Ronda *</label>
                <input type="text" id="rondaFormNombre" class="form-input custom-select-button" placeholder="Ej: Ronda Nocturna Perimetral" required />
              </div>
            </div>
          </div>

          <!-- Paso 3: Horario y Tolerancia -->
          <div class="mb-8">
            <div class="step-indicator">
              <div class="step-number">3</div>
              <div class="step-text">Programación</div>
            </div>
            <div class="form-grid g2">
              <div class="form-group">
                <label class="text-[10px] muted uppercase mb-1 block">Hora de Inicio *</label>
                <input type="time" id="rondaFormHora" class="form-input custom-select-button" required />
              </div>
              <div class="form-group">
                <label class="text-[10px] muted uppercase mb-1 block">Tolerancia *</label>
                <div class="flex gap-2">
                  <input type="number" id="rondaFormTolerancia" class="form-input custom-select-button flex-1" value="15" min="0" />
                  <select id="rondaFormToleranciaTipo" class="form-input custom-select-button" style="width: 110px;">
                    <option value="minutos">Minutos</option>
                    <option value="horas">Horas</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Paso 4: Frecuencia -->
          <div class="mb-8">
            <div class="step-indicator">
              <div class="step-number">4</div>
              <div class="step-text">Frecuencia y Repetición</div>
            </div>
            
            <div class="frequency-grid">
              <label class="frec-card active" data-frec="DIARIA">
                <input type="radio" name="frecType" value="DIARIA" checked />
                <span class="frec-card-icon">📅</span>
                <span class="frec-card-title">Diaria</span>
              </label>
              <label class="frec-card" data-frec="SEMANAL">
                <input type="radio" name="frecType" value="SEMANAL" />
                <span class="frec-card-icon">📆</span>
                <span class="frec-card-title">Semanal</span>
              </label>
              <label class="frec-card" data-frec="MENSUAL">
                <input type="radio" name="frecType" value="MENSUAL" />
                <span class="frec-card-icon">📋</span>
                <span class="frec-card-title">Mensual</span>
              </label>
              <label class="frec-card" data-frec="DIAS-ESPECIFICOS">
                <input type="radio" name="frecType" value="DIAS-ESPECIFICOS" />
                <span class="frec-card-icon">🎯</span>
                <span class="frec-card-title">Específicos</span>
              </label>
            </div>
            
            <div id="frecuenciaDiasSemana" style="display:none; margin-top:15px; background:rgba(255,255,255,0.02); padding:20px; border-radius:var(--radius-lg);">
              <label class="text-[11px] muted uppercase mb-3 block">Selecciona los días de la semana:</label>
              <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="1" /> Lun</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="2" /> Mar</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="3" /> Mié</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="4" /> Juv</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="5" /> Vie</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="6" /> Sáb</label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="dia-check" value="0" /> Dom</label>
              </div>
            </div>

            <div id="frecuenciaDiasEspecificos" style="display:none; margin-top:15px; background:rgba(255,255,255,0.02); padding:20px; border-radius:var(--radius-lg);">
              <label class="text-[11px] muted uppercase mb-2 block">Días del mes (separados por coma):</label>
              <input type="text" id="rondaFormDiasMes" class="form-input custom-select-button" placeholder="Ej: 1, 15, 30" />
              <small class="muted block mt-2" style="font-size:10px">Ingrese números del 1 al 31</small>
            </div>
          </div>

          <button type="submit" class="btn btn-primary w-full py-4 text-sm font-bold tracking-wider" id="btnGuardarRonda">
            CREAR RONDA OPERATIVA
          </button>
        </form>
      </div>

      <!-- Lado derecho: Puntos QR -->
      <div class="flex flex-col gap-4">
        <div class="card card-pad glass-card flex-1">
          <h3 class="flex items-center justify-between mb-2">
            Secuencia de Puntos QR
            <span class="badge badge-info px-3 py-1" id="countSelectedQR">0</span>
          </h3>
          <p class="muted text-[12px] mb-6">Seleccione un cliente/unidad y cargue los puntos. Luego marque los QRs que formarán parte de esta ronda.</p>
          
          <div id="rondaPuntosList" class="flex flex-col gap-2 max-h-[650px] overflow-y-auto pr-2 custom-scrollbar">
            <div class="empty-state py-12 text-center border-2 border-dashed border-white/5 rounded-2xl grayscale opacity-50">
              <div class="text-4xl mb-3">📍</div>
              <div class="font-bold text-sm tracking-tight">SIN PUNTOS CARGADOS</div>
              <div class="text-[10px] muted">Configure la ubicación arriba</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:24px">
      <h3>Historial de Rondas Configuradas</h3>
      <div class="filters-bar" style="padding:16px 0; display:flex; gap:12px; flex-wrap:wrap;">
          <div class="filter-group" style="flex:1; min-width:200px">
              <label class="text-[10px] muted uppercase mb-1 block">Filtrar Cliente</label>
              <button type="button" class="form-input text-left flex justify-between items-center" id="filterRondaClienteBtn">
                  <span id="labelFilterRondaCliente">Todos los Clientes</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
          </div>
          <div class="filter-group" style="flex:1; min-width:200px">
              <label class="text-[10px] muted uppercase mb-1 block">Filtrar Unidad</label>
              <button type="button" class="form-input text-left flex justify-between items-center disabled" id="filterRondaUnidadBtn">
                  <span id="labelFilterRondaUnidad">Todas las Unidades</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
          </div>
          <div class="flex gap-2" style="align-items: flex-end;">
              <button class="btn btn-primary" id="btnBuscarRondas" style="height:42px; padding:0 25px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Buscar
              </button>
              <button class="btn btn-secondary" id="btnLimpiarFiltrosRondas" style="height:42px; width:42px; padding:0; display:flex; align-items:center; justify-content:center;" title="Limpiar Filtros">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>
          </div>
      </div>
      
      <div id="rondasGridContainer" class="ronda-grid">
          <div class="text-center py-12 muted w-full" style="grid-column: 1/-1;">
              <p>Selecciona filtros y haz clic en "Buscar" para ver el historial de rondas</p>
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
  `;

  await loadFilters();
  setupEventListeners();
}

async function loadFilters() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.CLIENT_UNITS));
    cachedClientes = snap.docs.map(d => d.id).sort();
  } catch (e) { }
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

async function loadUnits(clienteId: string, isFilter = false) {
  try {
    const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${clienteId}/UNIDADES`));
    const units = snap.docs.map(d => d.id).sort();
    if (isFilter) filterUnidades = units;
    else cachedUnidades = units;
  } catch (e) {
    if (isFilter) filterUnidades = [];
    else cachedUnidades = [];
  }
}

function setupEventListeners() {
  const btnSelectCliente = document.getElementById('selectRondaClienteBtn')!;
  const btnSelectUnidad = document.getElementById('selectRondaUnidadBtn')!;
  const labelCliente = document.getElementById('labelRondaCliente')!;
  const labelUnidad = document.getElementById('labelRondaUnidad')!;

  btnSelectCliente.onclick = () => {
    openSelectorModal('Seleccionar Cliente', cachedClientes, (val) => {
      selectedCliente = val;
      labelCliente.textContent = val;
      labelCliente.classList.add('font-bold');
      selectedUnidad = null;
      labelUnidad.textContent = 'Seleccionar Unidad...';
      labelUnidad.classList.remove('font-bold');
      btnSelectUnidad.classList.remove('disabled');
      loadUnits(val, false);
    });
  };

  btnSelectUnidad.onclick = () => {
    if (!selectedCliente) return;
    openSelectorModal(`Unidades de ${selectedCliente}`, cachedUnidades, (val) => {
      selectedUnidad = val;
      labelUnidad.textContent = val;
      labelUnidad.classList.add('font-bold');
    });
  };

  // Filtros Historial
  const btnFilterCliente = document.getElementById('filterRondaClienteBtn')!;
  const btnFilterUnidad = document.getElementById('filterRondaUnidadBtn')!;
  const labelFilterCliente = document.getElementById('labelFilterRondaCliente')!;
  const labelFilterUnidad = document.getElementById('labelFilterRondaUnidad')!;

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
        loadUnits(val, true);
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

  const btnLoadQR = document.getElementById('btnRondaLoadQR');
  const form = document.getElementById('formRonda');
  const btnBuscar = document.getElementById('btnBuscarRondas');
  const btnLimpiar = document.getElementById('btnLimpiarFiltrosRondas');
  const containerQR = document.getElementById('rondaPuntosList');

  // Radios frecuencia
  const radios = document.getElementsByName('frecType');
  const divSemana = document.getElementById('frecuenciaDiasSemana');
  const divDiasEsp = document.getElementById('frecuenciaDiasEspecificos');

  radios.forEach(r => {
    r.addEventListener('change', (e: any) => {
      if (divSemana) divSemana.style.display = e.target.value === 'SEMANAL' ? 'block' : 'none';
      if (divDiasEsp) divDiasEsp.style.display = e.target.value === 'DIAS-ESPECIFICOS' ? 'block' : 'none';
    });
  });

  // Manejo visual de las tarjetas de frecuencia
  const frecCards = document.querySelectorAll('.frec-card');
  frecCards.forEach(card => {
    card.addEventListener('click', () => {
      frecCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input') as HTMLInputElement;
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    });
  });

  btnLoadQR?.addEventListener('click', async () => {
    if (!selectedCliente || !selectedUnidad) return UI.toast('Seleccione cliente y unidad', 'warning');

    UI.showLoader('Cargando QRs...', 'Buscando puntos de control', 30);
    try {
      const q = query(collection(db, COLLECTIONS.QR), where('cliente', '==', selectedCliente), where('unidad', '==', selectedUnidad));
      const snap = await getDocs(q);
      availableQRs = snap.docs.map(d => ({ ...d.data(), id: d.id }));

      if (containerQR) {
        if (availableQRs.length === 0) {
          containerQR.innerHTML = '<div style="text-align:center; padding:20px; color:var(--muted)">No hay QRs registrados para esta unidad.</div>';
        } else {
          containerQR.innerHTML = availableQRs.map(qr => `
                        <label class="qr-selection-item">
                            <input type="checkbox" class="qr-check" value="${qr.id}" data-name="${qr.nombre}" />
                            <div class="qr-info-container">
                                <div class="qr-info-name">${qr.nombre}</div>
                                <div class="qr-info-id">ID: ${qr.id}</div>
                            </div>
                            ${qr.requireQuestion === 'si' ? '<span class="badge badge-info" style="font-size:9px">PREGUNTA</span>' : ''}
                        </label>
                    `).join('');

          // Actualizar contador al marcar
          containerQR.querySelectorAll('.qr-check').forEach(chk => {
            chk.addEventListener('change', () => {
              const count = containerQR.querySelectorAll('.qr-check:checked').length;
              document.getElementById('countSelectedQR')!.textContent = count.toString();
            });
          });
        }
      }
    } catch (e) { UI.toast('Error al cargar QRs', 'error'); }
    finally { UI.hideLoader(); }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedCliente || !selectedUnidad) return UI.toast('Faltan datos de ubicación', 'warning');
    const nom = (document.getElementById('rondaFormNombre') as HTMLInputElement).value.trim();
    const hor = (document.getElementById('rondaFormHora') as HTMLInputElement).value;
    const tol = parseInt((document.getElementById('rondaFormTolerancia') as HTMLInputElement).value);
    const tolTipo = (document.getElementById('rondaFormToleranciaTipo') as HTMLSelectElement).value;
    const frec = (document.querySelector('input[name="frecType"]:checked') as HTMLInputElement)?.value;

    // QRs seleccionados
    const selectedChecks = document.querySelectorAll('.qr-check:checked') as NodeListOf<HTMLInputElement>;
    if (selectedChecks.length === 0) return UI.toast('Seleccione al menos un punto QR', 'warning');

    const puntosRonda = Array.from(selectedChecks).map(chk => {
      const qrId = chk.value;
      const fullQr = availableQRs.find(q => q.id === qrId);
      return {
        qrId: qrId,
        nombre: chk.dataset.name,
        requireQuestion: fullQr?.requireQuestion || 'no',
        questions: fullQr?.questions || []
      };
    });

    const rondaId = `ronda_${Date.now()}`;
    const rondaData: any = {
      id: rondaId,
      cliente: selectedCliente,
      unidad: selectedUnidad,
      nombre: nom,
      horario: hor,
      tolerancia: tol,
      toleranciaTipo: tolTipo,
      frecuencia: frec.toLowerCase(), // Guardar en minúsculas para compatibilidad
      puntosRonda,
      activa: true,
      createdAt: serverTimestamp()
    };

    if (frec === 'SEMANAL') {
      const dias = Array.from(document.querySelectorAll('.dia-check:checked') as NodeListOf<HTMLInputElement>).map(c => c.value);
      if (dias.length === 0) return UI.toast('Seleccione al menos un día', 'warning');
      rondaData.diasConfig = dias;
    } else if (frec === 'DIAS-ESPECIFICOS') {
      const diasMesInput = (document.getElementById('rondaFormDiasMes') as HTMLInputElement).value.trim();
      if (!diasMesInput) return UI.toast('Ingrese los días del mes', 'warning');
      const diasConfig = diasMesInput.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 1 && d <= 31);
      if (diasConfig.length === 0) return UI.toast('Ingrese días válidos (1-31)', 'warning');
      rondaData.diasConfig = diasConfig;
    }

    UI.showLoader('Guardando ronda...', 'Registrando configuración operativa', 50);
    try {
      await setDoc(doc(db, COLLECTIONS.RONDAS, rondaId), rondaData);
      UI.toast('Ronda creada correctamente');
      (form as HTMLFormElement).reset();
      selectedCliente = null;
      selectedUnidad = null;
      labelCliente.textContent = 'Seleccionar Cliente...';
      labelUnidad.textContent = 'Seleccionar Unidad...';
      btnSelectUnidad.classList.add('disabled');
      if (containerQR) containerQR.innerHTML = '';
      document.getElementById('countSelectedQR')!.textContent = '0';
      fetchRondas();
    } catch (e) { UI.toast('Error al guardar ronda', 'error'); }
    finally { UI.hideLoader(); }
  });

  btnBuscar?.addEventListener('click', fetchRondas);

  btnLimpiar?.addEventListener('click', () => {
    selectedFilterCliente = null;
    selectedFilterUnidad = null;
    labelFilterCliente.textContent = 'Todos los Clientes';
    labelFilterUnidad.textContent = 'Todas las Unidades';
    btnFilterUnidad.classList.add('disabled');

    rondasList = [];
    const grid = document.getElementById('rondasGridContainer');
    if (grid) {
      grid.innerHTML = `
        <div class="text-center py-12 muted w-full" style="grid-column: 1/-1;">
          <p>Selecciona filtros y haz clic en "Buscar" para ver el historial de rondas</p>
        </div>
      `;
    }
  });
}

async function fetchRondas() {
  const grid = document.getElementById('rondasGridContainer');
  if (!grid) return;

  grid.innerHTML = '<div class="text-center py-12 w-full muted" style="grid-column: 1/-1;">Buscando rondas...</div>';

  UI.showLoader('Buscando...', 'Cargando historial de rondas', 30);
  try {
    let q;
    const coll = collection(db, COLLECTIONS.RONDAS);

    if (selectedFilterCliente && selectedFilterUnidad) {
      q = query(coll, where('cliente', '==', selectedFilterCliente), where('unidad', '==', selectedFilterUnidad));
    } else if (selectedFilterCliente) {
      q = query(coll, where('cliente', '==', selectedFilterCliente));
    } else {
      q = query(coll, orderBy('createdAt', 'desc'), limit(50));
    }

    const snap = await getDocs(q);
    rondasList = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    // Ordenar en memoria
    rondasList.sort((a, b) => {
      const dateA = a.createdAt?.seconds ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const dateB = b.createdAt?.seconds ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return dateB - dateA;
    });

    renderRondasList();
  } catch (e) {
    console.error("Error fetching rondas:", e);
    grid.innerHTML = '<div class="text-center py-12 w-full error-text" style="grid-column: 1/-1;">Error al cargar rondas</div>';
    UI.toast('Error al cargar rondas', 'error');
  } finally { UI.hideLoader(); }
}

function renderRondasList() {
  const grid = document.getElementById('rondasGridContainer');
  if (!grid) return;

  if (rondasList.length === 0) {
    grid.innerHTML = '<div class="text-center py-12 w-full muted" style="grid-column: 1/-1;">No se encontraron rondas configuradas</div>';
    return;
  }

  grid.innerHTML = '';
  rondasList.forEach(r => {
    const card = document.createElement('div');
    card.className = 'ronda-card';

    card.innerHTML = `
            <div class="ronda-card-header">
                <h4 class="ronda-card-title">${r.nombre}</h4>
                <span class="badge ${r.activa ? 'badge-success' : 'badge-secondary'}">${r.activa ? 'ACTIVA' : 'INACTIVA'}</span>
            </div>
            <div class="muted text-[11px] uppercase font-bold tracking-wider">${r.cliente}</div>
            <div class="text-[12px] font-semibold mb-2">${r.unidad}</div>
            
            <div class="ronda-card-meta">
                <div class="ronda-meta-item">
                    <div class="ronda-meta-label">Horario</div>
                    <div class="ronda-meta-value">${r.horario || '--:--'}</div>
                </div>
                <div class="ronda-meta-item">
                    <div class="ronda-meta-label">Frecuencia</div>
                    <div class="ronda-meta-value text-capitalize">${r.frecuencia}</div>
                </div>
                <div class="ronda-meta-item">
                    <div class="ronda-meta-label">Tolerancia</div>
                    <div class="ronda-meta-value">${r.tolerancia} min</div>
                </div>
                <div class="ronda-meta-item">
                    <div class="ronda-meta-label">Puntos QR</div>
                    <div class="ronda-meta-value">${r.puntosRonda?.length || 0} pts</div>
                </div>
            </div>

            <div class="ronda-card-actions">
                <button class="btn btn-secondary btn-sm flex-1 btn-delete-ronda" data-id="${r.id}" style="color:#ef4444; background:rgba(239, 68, 68, 0.1); border:none">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" class="mr-2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Eliminar
                </button>
            </div>
        `;

    grid.appendChild(card);

    (card.querySelector('.btn-delete-ronda') as HTMLElement).onclick = () => {
      UI.dialog('Eliminar Configuración', '¿Eliminar esta ronda? Los reportes generados no se borrarán, pero la ronda dejará de estar activa.', async () => {
        UI.showLoader('Eliminando...', 'Borrando del servidor');
        try {
          await deleteDoc(doc(db, COLLECTIONS.RONDAS, r.id));
          UI.toast('Ronda eliminada');
          fetchRondas();
        } catch (e) { UI.toast('Error al eliminar', 'error'); }
        finally { UI.hideLoader(); }
      }, 'danger');
    };
  });
}
