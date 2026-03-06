import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit } from 'firebase/firestore';
import { UI } from '../ui';
import { masterCache } from '../cache-service';

const COLLECTIONS = {
  CLIENT_UNITS: 'CLIENTE_UNIDAD',
  QR: 'QR_CODES',
  RONDAS_CONFIG: 'RONDAS_CONFIGURADAS'
};

let cachedClientes: string[] = [];
let cachedUnidades: string[] = [];
let availableQRs: any[] = [];
let selectedCliente: string | null = null;
let selectedUnidad: string | null = null;

let selectedFilterCliente: string | null = null;
let selectedFilterUnidad: string | null = null;
let filterUnidades: string[] = [];
let rondasList: any[] = [];

export async function initCrearRondasView() {
  const container = document.getElementById('view-crear-rondas');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="fade-in px-4 py-6">
        <div class="g-flex g-items-center g-gap-4 g-mb-4">
            <div class="w-12 h-12 rounded-2xl bg-accent/10 g-flex g-items-center g-justify-center border border-accent/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <div>
                <h2 class="text-2xl font-bold text-white tracking-tight">Gestión de Rondas</h2>
                <p class="text-[10px] muted uppercase tracking-widest font-medium opacity-60">Configura las secuencias y horarios de las rondas operativas</p>
            </div>
        </div>

        <div class="ronda-main-grid">
            <!-- Columna Izquierda: Formulario -->
            <div class="ronda-form-side">
                <form id="formRonda" class="g-flex g-flex-col">
                    
                    <!-- PASO 1: UBICACIÓN -->
                    <div class="step-container-modern">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 1</span>
                            <span class="step-title">Ubicación</span>
                        </div>
                        <div class="g-grid g-cols-2 g-gap-4">
                            <div class="g-flex g-flex-col g-gap-2">
                                <label class="text-[10px] muted uppercase font-bold tracking-wider">Cliente *</label>
                                <button type="button" id="selectRondaClienteBtn" class="custom-select-button">
                                    <span id="labelRondaCliente">Seleccionar Cliente...</span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                            </div>
                            <div class="g-flex g-flex-col g-gap-2">
                                <label class="text-[10px] muted uppercase font-bold tracking-wider">Unidad *</label>
                                <button type="button" id="selectRondaUnidadBtn" class="custom-select-button disabled">
                                    <span id="labelRondaUnidad">Seleccionar Unidad...</span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- PASO 2: INFORMACIÓN -->
                    <div class="step-container-modern">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 2</span>
                            <span class="step-title">Información</span>
                        </div>
                        <div class="g-flex g-flex-col g-gap-2">
                            <label class="text-[10px] muted uppercase font-bold tracking-wider">Nombre de la Ronda *</label>
                            <input type="text" id="rondaNombre" class="custom-input-modern" placeholder="Ej: Ronda Nocturna Perimetral" required />
                        </div>
                    </div>

                    <!-- PASO 3: HORARIOS -->
                    <div class="step-container-modern">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 3</span>
                            <span class="step-title">Horarios</span>
                        </div>
                        <div class="g-grid g-cols-2 g-gap-4">
                            <div class="g-flex g-flex-col g-gap-2">
                                <label class="text-[10px] muted uppercase font-bold tracking-wider">Hora de Inicio *</label>
                                <input type="time" id="rondaHorario" class="custom-input-modern" required />
                            </div>
                            <div class="g-flex g-flex-col g-gap-2">
                                <label class="text-[10px] muted uppercase font-bold tracking-wider">Tolerancia *</label>
                                <div class="g-flex g-gap-2">
                                    <input type="number" id="rondaTolerancia" class="custom-input-modern" value="15" style="width: 80px" />
                                    <select id="rondaToleranciaTipo" class="custom-input-modern" style="flex: 1">
                                        <option value="minutos">Minutos</option>
                                        <option value="horas">Horas</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- PASO 4: FRECUENCIA -->
                    <div class="step-container-modern">
                        <div class="step-indicator-modern">
                            <span class="step-badge">Paso 4</span>
                            <span class="step-title">Frecuencia</span>
                        </div>
                        <select id="rondaFrecuenciaSelect" class="custom-input-modern g-mb-4">
                            <option value="DIARIA">Diaria</option>
                            <option value="SEMANAL">Semanal (Días específicos)</option>
                            <option value="DIAS-ESPECIFICOS">Días del mes específicos</option>
                        </select>

                        <div id="frecuenciaDiasSemana" style="display:none" class="g-mt-4">
                            <label class="text-[10px] muted uppercase font-bold tracking-wider g-mb-2">Días de la semana</label>
                            <div class="g-flex g-gap-2 g-mt-2">
                                ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `
                                    <label class="g-flex g-items-center g-justify-center w-8 h-8 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:border-accent transition-colors">
                                        <input type="checkbox" name="rondaDiasSemana" value="${d}" class="hidden">
                                        <span class="text-[10px] font-bold">${d}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="g-flex g-gap-4 g-mt-4">
                        <button type="button" id="btnLimpiarForm" class="btn btn-secondary flex-1">
                            Limpiar
                        </button>
                        <button type="submit" class="btn btn-accent flex-[2] font-bold">
                            CREAR RONDA
                        </button>
                    </div>
                </form>
            </div>

            <!-- Columna Derecha: Listado de QRs -->
            <div class="ronda-qr-side">
                <div class="step-container-modern" style="min-height: 100%; margin-bottom: 0;">
                    <div class="qr-sidebar-header">
                        <div class="g-flex g-items-center g-gap-3">
                            <div class="qr-checkbox-modern" style="border-radius: 4px; background: var(--accent); border:none">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <h3 class="text-sm font-bold text-white tracking-wide">Puntos de Ronda</h3>
                        </div>
                        <span class="badge badge-accent" id="countSelectedQR">0</span>
                    </div>

                    <div id="rondaPuntosList" class="qr-list-modern">
                        <div class="empty-state py-20 text-center opacity-30 grayscale slide-up">
                            <div class="text-5xl mb-4">📍</div>
                            <div class="font-bold text-sm uppercase tracking-widest">Esperando ubicación</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="historial-title-area">
            <div class="g-flex g-justify-between g-items-center g-mb-4">
                <div>
                    <h3 class="text-lg font-bold text-white">Historial de Rondas</h3>
                    <p class="text-[10px] muted uppercase tracking-widest font-medium opacity-50">Gestiona las secuencias configuradas previamente</p>
                </div>
            </div>
            
            <div class="filters-bar p-4 mb-6" style="background:rgba(255,255,255,0.02); border-radius:15px; border:1px solid rgba(255,255,255,0.05)">
                <div class="g-flex g-gap-4 g-items-end g-w-full">
                    <div class="filter-group flex-1">
                        <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Cliente</label>
                        <div id="filterRondaClienteBtn" class="selector-btn text-xs" style="background: rgba(15, 23, 42, 0.4);">
                            <span id="labelFilterRondaCliente">Todos los Clientes</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="filter-group flex-1">
                        <label class="text-[10px] uppercase font-bold muted mb-1 block">Filtrar por Unidad</label>
                        <div id="filterRondaUnidadBtn" class="selector-btn text-xs disabled" style="background: rgba(15, 23, 42, 0.4);">
                            <span id="labelFilterRondaUnidad">Todas las Unidades</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="g-flex g-gap-2">
                        <button id="btnBuscarRondas" class="btn btn-primary text-sm px-6 h-[42px]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" class="mr-2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            Buscar
                        </button>
                        <button id="btnLimpiarFiltrosRondas" class="btn btn-secondary text-sm px-4 h-[42px]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div id="rondasGridContainer" class="historial-grid-modern">
            <div class="col-span-full py-12 text-center text-muted border-2 border-dashed border-white/5 rounded-2xl">
                <p class="text-sm">Configura los filtros arriba para buscar rondas existentes</p>
            </div>
        </div>
    </div>

    <!-- Modal de Selección Genérico -->
    <div class="modal selector-modal" id="selectorModalRondas" aria-hidden="true">
        <div class="modal-box glass-card border-accent/20 max-w-sm">
            <div class="g-flex g-items-center g-justify-between g-mb-4">
                <h3 id="selectorTitleRondas" class="text-white font-bold text-lg">Seleccionar</h3>
                <button type="button" class="btn btn-sm btn-secondary p-1" id="selectorCancelBtnRondas">
                   ✕
                </button>
            </div>
            <div class="search-box g-mb-4 relative">
                <input type="text" id="selectorSearchRondas" placeholder="Escribe para buscar..." class="custom-input-modern g-w-full">
            </div>
            <div id="selectorListRondas" class="selector-list-container custom-scrollbar"></div>
        </div>
    </div>
  `;

  await loadFilters();

  // Ensure DOM is ready before attaching listeners
  setTimeout(() => {
    setupEventListeners();
  }, 50);
}

async function loadFilters() {
  try {
    const data = await masterCache.getClientUnits();
    cachedClientes = Object.keys(data).sort();
  } catch (e) { }
}

async function openSelectorModal(title: string, items: string[], onSelect: (val: string) => void) {
  const modal = document.getElementById('selectorModalRondas');
  const modalTitle = document.getElementById('selectorTitleRondas');
  const listGroup = document.getElementById('selectorListRondas');
  const searchInput = document.getElementById('selectorSearchRondas') as HTMLInputElement;

  if (!modal || !modalTitle || !listGroup || !searchInput) return;

  modalTitle.textContent = title;
  searchInput.value = '';

  const render = (filteredItems: string[]) => {
    listGroup.innerHTML = '';
    if (filteredItems.length === 0) {
      listGroup.innerHTML = '<div class="p-4 text-center text-xs muted">No se encontraron resultados</div>';
      return;
    }
    filteredItems.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'selector-list-item';
      btn.textContent = item;
      btn.onclick = (e) => {
        e.preventDefault();
        onSelect(item);
        modal.classList.remove('active');
      };
      listGroup.appendChild(btn);
    });
  };

  render(items);

  // Clean up old listener to prevent multiple bindings if called multiple times
  const oldCancelBtn = document.getElementById('selectorCancelBtnRondas');
  if (oldCancelBtn) {
    const newCancelBtn = oldCancelBtn.cloneNode(true);
    oldCancelBtn.parentNode?.replaceChild(newCancelBtn, oldCancelBtn);
    newCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.remove('active');
    });
  }

  searchInput.oninput = () => {
    const term = searchInput.value.toLowerCase();
    render(items.filter(i => i.toLowerCase().includes(term)));
  };

  modal.classList.add('active');
}

async function loadUnits(cliente: string, isFilter: boolean) {
  try {
    const q = query(collection(db, COLLECTIONS.CLIENT_UNITS, cliente, 'UNIDADES'));
    const snap = await getDocs(q);
    const units = snap.docs.map(d => d.id).sort();
    if (isFilter) filterUnidades = units;
    else {
      cachedUnidades = units;
      document.getElementById('selectRondaUnidadBtn')?.classList.remove('disabled');
      loadAvailableQRs();
    }
  } catch (e) { }
}

async function loadAvailableQRs() {
  if (!selectedCliente || !selectedUnidad) return;

  const containerQR = document.getElementById('rondaPuntosList');
  if (containerQR) containerQR.innerHTML = '<div class="p-8 text-center text-xs muted uppercase tracking-widest">Cargando puntos...</div>';

  try {
    const q = query(collection(db, COLLECTIONS.QR), where('cliente', '==', selectedCliente), where('unidad', '==', selectedUnidad));
    const snap = await getDocs(q);
    availableQRs = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    if (containerQR) {
      if (availableQRs.length === 0) {
        containerQR.innerHTML = '<div class="p-8 text-center text-xs muted">No hay QRs registrados</div>';
      } else {
        containerQR.innerHTML = availableQRs.map(qr => `
                <label class="qr-item-modern g-flex g-items-center g-gap-4">
                    <input type="checkbox" class="qr-check hidden" value="${qr.id}" data-name="${qr.nombre}" />
                    <div class="qr-checkbox-modern">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="4" class="hidden"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm font-bold text-white">${qr.nombre}</div>
                        <div class="text-[9px] muted uppercase tracking-widest">${qr.id}</div>
                    </div>
                </label>
            `).join('');

        containerQR.querySelectorAll('.qr-check').forEach(chk => {
          chk.addEventListener('change', (e: any) => {
            const label = (e.target as HTMLElement).closest('label');
            const svg = label?.querySelector('svg');
            if (e.target.checked) {
              label?.classList.add('active');
              svg?.classList.remove('hidden');
            } else {
              label?.classList.remove('active');
              svg?.classList.add('hidden');
            }
            const count = containerQR.querySelectorAll('.qr-check:checked').length;
            document.getElementById('countSelectedQR')!.textContent = count.toString();
          });
        });
      }
    }
  } catch (e) { UI.toast('Error al cargar QRs', 'error'); }
}

function setupEventListeners() {
  const btnSelectCliente = document.getElementById('selectRondaClienteBtn');
  const btnSelectUnidad = document.getElementById('selectRondaUnidadBtn');
  const labelCliente = document.getElementById('labelRondaCliente');
  const labelUnidad = document.getElementById('labelRondaUnidad');

  console.log('[Init] setupEventListeners executed.', {
    hasBtnCliente: !!btnSelectCliente,
    hasBtnUnidad: !!btnSelectUnidad,
    hasLabelCliente: !!labelCliente,
    hasLabelUnidad: !!labelUnidad
  });

  if (btnSelectCliente) {
    btnSelectCliente.addEventListener('click', () => {
      console.log('Cliente button clicked, opening modal with:', cachedClientes);
      openSelectorModal('Seleccionar Cliente', cachedClientes, (val) => {
        selectedCliente = val;
        if (labelCliente) labelCliente.textContent = val;
        selectedUnidad = null;
        if (labelUnidad) labelUnidad.textContent = 'Seleccionar Unidad...';
        loadUnits(val, false);
      });
    });
  }

  if (btnSelectUnidad) {
    btnSelectUnidad.addEventListener('click', () => {
      if (!selectedCliente) {
        UI.toast('Seleccione primero un cliente', 'warning');
        return;
      }
      openSelectorModal(`Unidades de ${selectedCliente}`, cachedUnidades, (val) => {
        selectedUnidad = val;
        if (labelUnidad) labelUnidad.textContent = val;
        loadAvailableQRs();
      });
    });
  }

  const frecSelect = document.getElementById('rondaFrecuenciaSelect') as HTMLSelectElement;
  const divSemana = document.getElementById('frecuenciaDiasSemana');
  frecSelect?.addEventListener('change', (e: any) => {
    if (divSemana) divSemana.style.display = e.target.value === 'SEMANAL' ? 'block' : 'none';
  });

  const form = document.getElementById('formRonda');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedCliente || !selectedUnidad) return UI.toast('Seleccione cliente y unidad', 'warning');

    const selectedQRs = Array.from(document.querySelectorAll('.qr-check:checked')).map((chk: any) => ({
      id: chk.value,
      nombre: chk.dataset.name
    }));

    if (selectedQRs.length === 0) return UI.toast('Seleccione al menos un punto QR', 'warning');

    UI.showLoader('Guardando ronda...');
    try {
      const data = {
        nombre: (document.getElementById('rondaNombre') as HTMLInputElement).value,
        cliente: selectedCliente,
        unidad: selectedUnidad,
        horario: (document.getElementById('rondaHorario') as HTMLInputElement).value,
        tolerancia: (document.getElementById('rondaTolerancia') as HTMLInputElement).value,
        toleranciaTipo: (document.getElementById('rondaToleranciaTipo') as HTMLSelectElement).value,
        frecuencia: (document.getElementById('rondaFrecuenciaSelect') as HTMLSelectElement).value,
        puntosRonda: selectedQRs,
        activa: true,
        creadoEn: new Date().toISOString()
      };

      await addDoc(collection(db, COLLECTIONS.RONDAS_CONFIG), data);
      UI.toast('Ronda creada con éxito', 'success');

      // Cleanup Form after success
      selectedCliente = null;
      selectedUnidad = null;
      const labelCliente = document.getElementById('labelRondaCliente');
      const labelUnidad = document.getElementById('labelRondaUnidad');
      const unBtn = document.getElementById('selectRondaUnidadBtn');
      if (labelCliente) labelCliente.textContent = 'Seleccionar Cliente...';
      if (labelUnidad) labelUnidad.textContent = 'Seleccionar Unidad...';
      if (unBtn) unBtn.classList.add('disabled');

      (document.getElementById('rondaNombre') as HTMLInputElement).value = '';
      (document.getElementById('rondaHorario') as HTMLInputElement).value = '--:--';
      (document.getElementById('rondaTolerancia') as HTMLInputElement).value = '15';

      const containerQR = document.getElementById('rondaPuntosList');
      if (containerQR) containerQR.innerHTML = '<div class="p-8 text-center text-xs muted uppercase tracking-widest">Esperando Ubicación</div>';

      fetchRondas();
    } catch (e) { UI.toast('Error al guardar ronda', 'error'); }
    finally { UI.hideLoader(); }
  });

  const btnBuscar = document.getElementById('btnBuscarRondas');
  if (btnBuscar) btnBuscar.onclick = fetchRondas;

  const btnLimpiarForm = document.getElementById('btnLimpiarFormRonda');
  if (btnLimpiarForm) {
    btnLimpiarForm.addEventListener('click', () => {
      selectedCliente = null;
      selectedUnidad = null;
      const labelCliente = document.getElementById('labelRondaCliente');
      const labelUnidad = document.getElementById('labelRondaUnidad');
      const unBtn = document.getElementById('selectRondaUnidadBtn');
      if (labelCliente) labelCliente.textContent = 'Seleccionar Cliente...';
      if (labelUnidad) labelUnidad.textContent = 'Seleccionar Unidad...';
      if (unBtn) unBtn.classList.add('disabled');

      (document.getElementById('rondaNombre') as HTMLInputElement).value = '';
      (document.getElementById('rondaHorario') as HTMLInputElement).value = '--:--';
      (document.getElementById('rondaTolerancia') as HTMLInputElement).value = '15';

      const containerQR = document.getElementById('rondaPuntosList');
      if (containerQR) containerQR.innerHTML = '<div class="p-8 text-center text-xs muted uppercase tracking-widest">Esperando Ubicación</div>';
    });
  }

  // --- Logic for Historial Filters --- //
  const btnFilterCliente = document.getElementById('filterRondaClienteBtn');
  const btnFilterUnidad = document.getElementById('filterRondaUnidadBtn');
  const labelFilterCliente = document.getElementById('labelFilterRondaCliente');
  const labelFilterUnidad = document.getElementById('labelFilterRondaUnidad');

  if (btnFilterCliente) {
    btnFilterCliente.addEventListener('click', () => {
      openSelectorModal('Filtrar por Cliente', ['Todos los Clientes', ...cachedClientes], (val) => {
        if (val === 'Todos los Clientes') {
          selectedFilterCliente = null;
          if (labelFilterCliente) labelFilterCliente.textContent = 'Todos los Clientes';
          btnFilterUnidad?.classList.add('disabled');
        } else {
          selectedFilterCliente = val;
          if (labelFilterCliente) labelFilterCliente.textContent = val;
          btnFilterUnidad?.classList.remove('disabled');
          loadUnits(val, true); // Loads into filterUnidades
        }
        selectedFilterUnidad = null;
        if (labelFilterUnidad) labelFilterUnidad.textContent = 'Todas las Unidades';
      });
    });
  }

  if (btnFilterUnidad) {
    btnFilterUnidad.addEventListener('click', () => {
      if (!selectedFilterCliente) return;
      openSelectorModal(`Unidades de ${selectedFilterCliente}`, ['Todas las Unidades', ...filterUnidades], (val) => {
        if (val === 'Todas las Unidades') {
          selectedFilterUnidad = null;
          if (labelFilterUnidad) labelFilterUnidad.textContent = 'Todas las Unidades';
        } else {
          selectedFilterUnidad = val;
          if (labelFilterUnidad) labelFilterUnidad.textContent = val;
          fetchRondas(); // AUTO-LOAD
        }
      });
    });
  }

  const btnLimpiarFiltrosRondas = document.getElementById('btnLimpiarFiltrosRondas');
  if (btnLimpiarFiltrosRondas) {
    btnLimpiarFiltrosRondas.addEventListener('click', () => {
      selectedFilterCliente = null;
      selectedFilterUnidad = null;
      if (labelFilterCliente) labelFilterCliente.textContent = 'Todos los Clientes';
      if (labelFilterUnidad) labelFilterUnidad.textContent = 'Todas las Unidades';
      btnFilterUnidad?.classList.add('disabled');
      fetchRondas();
    });
  }
}

async function fetchRondas() {
  const grid = document.getElementById('rondasGridContainer');
  if (grid) grid.innerHTML = '<div class="col-span-full py-12 text-center text-xs muted uppercase">Buscando rondas...</div>';

  try {
    let q;
    const coll = collection(db, COLLECTIONS.RONDAS_CONFIG);

    if (selectedFilterCliente && selectedFilterUnidad) {
      q = query(coll, where('cliente', '==', selectedFilterCliente), where('unidad', '==', selectedFilterUnidad));
    } else if (selectedFilterCliente) {
      q = query(coll, where('cliente', '==', selectedFilterCliente));
    } else {
      q = query(coll, orderBy('creadoEn', 'desc'), limit(50));
    }

    const snap = await getDocs(q);
    rondasList = snap.docs.map(d => ({ ...d.data(), id: d.id }));

    // Sort in memory locally to avoid composite index errors
    rondasList.sort((a, b) => {
      const dateA = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
      const dateB = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
      return dateB - dateA;
    });

    renderRondasList();
  } catch (e) {
    console.error("Error in fetchRondas:", e);
    UI.toast('Error al listar rondas', 'error');
  }
}

function renderRondasList() {
  const grid = document.getElementById('rondasGridContainer');
  if (!grid) return;

  if (rondasList.length === 0) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-muted border-2 border-dashed border-white/5 rounded-2xl">No hay rondas configuradas</div>';
    return;
  }

  grid.innerHTML = rondasList.map(r => `
        <div class="ronda-card-modern fade-in">
            <div class="ronda-card-header">
                <div class="g-flex g-flex-col">
                    <h4 class="text-sm font-bold text-white">${r.nombre}</h4>
                    <span class="text-[9px] muted uppercase tracking-widest font-bold mt-1">${r.cliente}</span>
                </div>
                <span class="badge ${r.activa ? 'badge-success' : 'badge-secondary'} text-[9px]">${r.activa ? 'ACTIVA' : 'INACTIVA'}</span>
            </div>
            <div class="ronda-card-body">
                <div class="g-flex g-items-center g-gap-3 g-mb-4">
                    <div class="text-xs font-semibold text-white/80">${r.unidad}</div>
                </div>
                <div class="ronda-meta-grid">
                    <div class="ronda-meta-box">
                        <div class="ronda-meta-label">Horario</div>
                        <div class="ronda-meta-value">${r.horario}</div>
                    </div>
                    <div class="ronda-meta-box">
                        <div class="ronda-meta-label">Frecuencia</div>
                        <div class="ronda-meta-value">${r.frecuencia}</div>
                    </div>
                    <div class="ronda-meta-box">
                        <div class="ronda-meta-label">Tolerancia</div>
                        <div class="ronda-meta-value">${r.tolerancia} ${r.toleranciaTipo === 'minutos' ? 'min' : 'h'}</div>
                    </div>
                    <div class="ronda-meta-box">
                        <div class="ronda-meta-label">Puntos</div>
                        <div class="ronda-meta-value">${r.puntosRonda?.length || 0} pts</div>
                    </div>
                </div>
            </div>
            <div class="ronda-card-footer">
                <button class="btn btn-sm btn-delete-ronda text-danger/50 hover:text-danger" data-id="${r.id}">
                    ELIMINAR
                </button>
            </div>
        </div>
    `).join('');

  grid.querySelectorAll('.btn-delete-ronda').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      if (!confirm('¿Seguro que desea eliminar esta ronda?')) return;
      try {
        await deleteDoc(doc(db, COLLECTIONS.RONDAS_CONFIG, id));
        UI.toast('Ronda eliminada', 'success');
        fetchRondas();
      } catch (e) { UI.toast('Error al eliminar', 'error'); }
    });
  });
}
