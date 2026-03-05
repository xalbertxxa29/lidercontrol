import { UI } from '../ui';
import { db } from '../firebase';
import { accessControl } from '../access-control';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  getDoc
} from 'firebase/firestore';

const COLLECTIONS = {
  CLIENT_UNITS: 'CLIENTE_UNIDAD'
};

// Estado Local
let selectedCliente: string | null = null;
let selectedUnidad: string | null = null;
let listaClientes: string[] = [];
let listaUnidades: string[] = [];
let listaPuestos: string[] = [];

export async function initClienteUnidadView() {
  const container = document.getElementById('view-cliente-unidad');
  if (!container) return;

  // Verificar permisos básicos (ADMIN o SUPERVISOR para editar, CLIENTE para solo ver)
  const canEdit = accessControl.isAdmin() || accessControl.isSupervisor();

  if (!accessControl.isAdmin() && !accessControl.isSupervisor() && !accessControl.isCliente()) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Acceso Denegado</div>
        <div class="empty-sub">No tienes los permisos necesarios para ver esta sección.</div>
      </div>
    `;
    return;
  }

  // Evitar re-inicializar si ya tiene contenido
  if (container.innerHTML.trim() !== '' && document.getElementById('hierarchical-container')) return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Estructura Operativa</h2>
        <h4 class="muted">Gestión de Clientes, Unidades y Puestos</h4>
      </div>
      ${canEdit ? `
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="btnNuevoCliente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Cliente
        </button>
      </div>` : ''}
    </div>

    <div id="hierarchical-container" class="grid-3" style="gap: 20px; align-items: start;">
      <!-- Panel de Clientes -->
      <div class="card card-pad">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold">1. Cliente</h3>
        </div>
        <div class="search-box mb-3">
          <input type="text" id="searchCliente" placeholder="Buscar cliente..." class="form-input" />
        </div>
        <div id="listClientes" class="list-group" style="max-height: 400px; overflow-y: auto;">
          <div class="loading-text">Cargando clientes...</div>
        </div>
      </div>

      <!-- Panel de Unidades -->
      <div class="card card-pad" id="panelUnidades" style="opacity: 0.5; pointer-events: none;">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold">2. Unidad</h3>
          ${canEdit ? `
          <button class="btn btn-secondary btn-sm" id="btnNuevaUnidad" style="padding: 4px 8px;">
            + Unidad
          </button>` : ''}
        </div>
        <div class="search-box mb-3">
          <input type="text" id="searchUnidad" placeholder="Filtrar unidades..." class="form-input" />
        </div>
        <div id="listUnidades" class="list-group" style="max-height: 400px; overflow-y: auto;">
          <div class="muted-text">Selecciona un cliente primero</div>
        </div>
      </div>

      <!-- Panel de Puestos -->
      <div class="card card-pad" id="panelPuestos" style="opacity: 0.5; pointer-events: none;">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold">3. Puestos</h3>
          ${canEdit ? `
          <button class="btn btn-secondary btn-sm" id="btnNuevoPuesto" style="padding: 4px 8px;">
            + Puesto
          </button>` : ''}
        </div>
        <div id="listPuestos" class="list-group" style="max-height: 400px; overflow-y: auto;">
          <div class="muted-text">Selecciona una unidad primero</div>
        </div>
      </div>
    </div>

    <!-- Modales de Edición/Creación -->
    <div class="modal" id="cuModal" aria-hidden="true">
      <div class="modal-box">
        <h3 id="cuModalTitle">Titulo Modal</h3>
        <form id="cuForm">
          <div id="cuModalContent"></div>
          <div class="modal-actions mt-4 flex justify-end gap-2">
            <button type="button" class="btn secondary" id="cuModalCancel">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="cuModalSave">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  setupEvents();
  await loadClientes();
}

async function loadClientes() {
  const container = document.getElementById('listClientes');
  if (!container) return;

  try {
    const clienteAsignado = accessControl.getClienteFilter();
    let clientes: string[] = [];

    if (clienteAsignado) {
      clientes = [clienteAsignado];
    } else {
      const snap = await getDocs(query(collection(db, COLLECTIONS.CLIENT_UNITS), limit(200)));
      clientes = snap.docs.map(d => d.id).sort();
    }

    listaClientes = clientes;
    renderList('listClientes', clientes, (id) => selectCliente(id), 'cliente');

    // Si solo hay uno (rol CLIENTE), seleccionarlo automáticamente
    if (clientes.length === 1) {
      selectCliente(clientes[0]);
    }
  } catch (e) {
    container.innerHTML = '<div class="error-text">Error al cargar clientes</div>';
  }
}

async function selectCliente(clienteId: string) {
  selectedCliente = clienteId;
  selectedUnidad = null;
  listaPuestos = [];

  // Actualizar UI de selección
  document.querySelectorAll('#listClientes .list-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === clienteId);
  });

  // Habilitar panel unidades
  const panelU = document.getElementById('panelUnidades')!;
  panelU.style.opacity = '1';
  panelU.style.pointerEvents = 'auto';

  // Limpiar y deshabilitar puestos
  const panelP = document.getElementById('panelPuestos')!;
  panelP.style.opacity = '0.5';
  panelP.style.pointerEvents = 'none';
  document.getElementById('listPuestos')!.innerHTML = '<div class="muted-text">Selecciona una unidad primero</div>';

  await loadUnidades(clienteId);
}

async function loadUnidades(clienteId: string) {
  const container = document.getElementById('listUnidades');
  if (!container) return;
  container.innerHTML = '<div class="loading-text">Cargando unidades...</div>';

  try {
    const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${clienteId}/UNIDADES`));
    let unidades = snap.docs.map(d => d.id).sort();

    // Filtrar por unidades asignadas si es CLIENTE
    if (accessControl.isCliente()) {
      const asignadas = accessControl.getUnidadesAsignadas();
      if (asignadas.length > 0) {
        unidades = unidades.filter(u => asignadas.includes(u));
      }
    }

    listaUnidades = unidades;
    renderList('listUnidades', unidades, (id) => selectUnidad(id), 'unidad');

    // Si solo hay una unidad asignada, seleccionarla automáticamente
    if (unidades.length === 1) {
      selectUnidad(unidades[0]);
    }
  } catch (e) {
    container.innerHTML = '<div class="error-text">Error al cargar unidades</div>';
  }
}

async function selectUnidad(unidadId: string) {
  selectedUnidad = unidadId;

  // Actualizar UI
  document.querySelectorAll('#listUnidades .list-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === unidadId);
  });

  // Habilitar panel puestos
  const panelP = document.getElementById('panelPuestos')!;
  panelP.style.opacity = '1';
  panelP.style.pointerEvents = 'auto';

  await loadPuestos(selectedCliente!, unidadId);
}

async function loadPuestos(clienteId: string, unidadId: string) {
  const container = document.getElementById('listPuestos');
  if (!container) return;
  container.innerHTML = '<div class="loading-text">Cargando puestos...</div>';

  try {
    const snap = await getDocs(collection(db, `${COLLECTIONS.CLIENT_UNITS}/${clienteId}/UNIDADES/${unidadId}/PUESTOS`));
    const puestos = snap.docs.map(d => d.id).sort();
    listaPuestos = puestos;
    renderList('listPuestos', puestos, null, 'puesto');
  } catch (e) {
    container.innerHTML = '<div class="error-text">Error al cargar puestos</div>';
  }
}

function renderList(containerId: string, items: string[], onSelect: ((id: string) => void) | null, type: 'cliente' | 'unidad' | 'puesto') {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="muted-text">No hay ${type}s registrados</div>`;
    return;
  }

  const canEdit = accessControl.isAdmin() || accessControl.isSupervisor();
  const frag = document.createDocumentFragment();

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item flex justify-between items-center';
    div.setAttribute('data-id', item);

    // Contenido del item
    const content = document.createElement('div');
    content.className = 'flex-grow cursor-pointer py-2 px-3';
    content.textContent = item;
    if (onSelect) content.onclick = () => onSelect(item);

    div.appendChild(content);

    // Acciones (solo para ADMIN/SUPERVISOR)
    if (canEdit) {
      const actions = document.createElement('div');
      actions.className = 'flex gap-1 pr-2';

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-icon-del';
      btnDel.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      btnDel.onclick = (e) => { e.stopPropagation(); deleteEntry(type, item); };

      actions.appendChild(btnDel);
      div.appendChild(actions);
    }

    frag.appendChild(div);
  });

  container.innerHTML = '';
  container.appendChild(frag);
}

function setupEvents() {
  const canEdit = accessControl.isAdmin() || accessControl.isSupervisor();

  // Búsqueda Predictiva Clientes
  document.getElementById('searchCliente')?.addEventListener('input', (e) => {
    const term = (e.target as HTMLInputElement).value.toLowerCase();
    const filtered = listaClientes.filter(c => c.toLowerCase().includes(term));
    renderList('listClientes', filtered, (id) => selectCliente(id), 'cliente');
  });

  // Búsqueda Unidades
  document.getElementById('searchUnidad')?.addEventListener('input', (e) => {
    const term = (e.target as HTMLInputElement).value.toLowerCase();
    const filtered = listaUnidades.filter(u => u.toLowerCase().includes(term));
    renderList('listUnidades', filtered, (id) => selectUnidad(id), 'unidad');
  });

  if (canEdit) {
    const btnNuevoCliente = document.getElementById('btnNuevoCliente');
    if (btnNuevoCliente) btnNuevoCliente.onclick = () => openModal('cliente');

    const btnNuevaUnidad = document.getElementById('btnNuevaUnidad');
    if (btnNuevaUnidad) btnNuevaUnidad.onclick = () => openModal('unidad');

    const btnNuevoPuesto = document.getElementById('btnNuevoPuesto');
    if (btnNuevoPuesto) btnNuevoPuesto.onclick = () => openModal('puesto');

    const btnCancel = document.getElementById('cuModalCancel');
    if (btnCancel) btnCancel.onclick = () => document.getElementById('cuModal')?.classList.remove('show');

    const cuForm = document.getElementById('cuForm');
    if (cuForm) cuForm.onsubmit = async (e) => {
      e.preventDefault();
      await handleSave();
    };
  }
}

function openModal(type: 'cliente' | 'unidad' | 'puesto') {
  const modal = document.getElementById('cuModal')!;
  const title = document.getElementById('cuModalTitle')!;
  const content = document.getElementById('cuModalContent')!;

  modal.setAttribute('data-type', type);
  content.innerHTML = '';

  if (type === 'cliente') {
    title.textContent = 'Nuevo Cliente';
    content.innerHTML = `
      <label class="block mb-2">Nombre del Cliente
        <input type="text" id="modalInput" placeholder="Ej: LIDERMAN" required class="form-input mt-1" />
      </label>
    `;
  } else if (type === 'unidad') {
    title.textContent = `Nueva Unidad para ${selectedCliente}`;
    content.innerHTML = `
      <label class="block mb-2">Nombre de la Unidad
        <input type="text" id="modalInput" placeholder="Ej: SEDE CENTRAL" required class="form-input mt-1" />
      </label>
    `;
  } else if (type === 'puesto') {
    title.textContent = `Nuevo Puesto para ${selectedUnidad}`;
    content.innerHTML = `
      <label class="block mb-2">Nombre del Puesto
        <input type="text" id="modalInput" placeholder="Ej: VIGILANTE" required class="form-input mt-1" />
      </label>
    `;
  }

  modal.classList.add('show');
  setTimeout(() => document.getElementById('modalInput')?.focus(), 100);
}

async function handleSave() {
  const modal = document.getElementById('cuModal')!;
  const type = modal.getAttribute('data-type');
  const value = (document.getElementById('modalInput') as HTMLInputElement).value.toUpperCase().trim();

  if (!value) return;

  UI.showLoader('Guardando...', 'Actualizando estructura operativa');
  try {
    if (type === 'cliente') {
      await setDoc(doc(db, COLLECTIONS.CLIENT_UNITS, value), { creado: new Date(), descripcion: value });
      await loadClientes();
    } else if (type === 'unidad') {
      await setDoc(doc(db, `${COLLECTIONS.CLIENT_UNITS}/${selectedCliente}/UNIDADES`, value), { nombre: value, creado: new Date() });
      await loadUnidades(selectedCliente!);
    } else if (type === 'puesto') {
      await setDoc(doc(db, `${COLLECTIONS.CLIENT_UNITS}/${selectedCliente}/UNIDADES/${selectedUnidad}/PUESTOS`, value), { nombre: value, creado: new Date() });
      await loadPuestos(selectedCliente!, selectedUnidad!);
    }

    UI.toast('Guardado correctamente', 'success');
    modal.classList.remove('show');
  } catch (e) {
    UI.toast('Error al guardar', 'error');
  } finally {
    UI.hideLoader();
  }
}

async function deleteEntry(type: 'cliente' | 'unidad' | 'puesto', id: string) {
  const confirmMsg = `¿Estás seguro de eliminar el ${type} "${id}"? Esta acción no se puede deshacer.`;

  UI.dialog('Confirmar Eliminación', confirmMsg, async () => {
    UI.showLoader('Eliminando...', 'Actualizando base de datos');
    try {
      if (type === 'cliente') {
        await deleteDoc(doc(db, COLLECTIONS.CLIENT_UNITS, id));
        if (selectedCliente === id) {
          selectedCliente = null;
          selectedUnidad = null;
          listaUnidades = [];
          listaPuestos = [];
        }
        await loadClientes();
      } else if (type === 'unidad') {
        await deleteDoc(doc(db, `${COLLECTIONS.CLIENT_UNITS}/${selectedCliente}/UNIDADES/${id}`));
        if (selectedUnidad === id) {
          selectedUnidad = null;
          listaPuestos = [];
        }
        await loadUnidades(selectedCliente!);
      } else if (type === 'puesto') {
        await deleteDoc(doc(db, `${COLLECTIONS.CLIENT_UNITS}/${selectedCliente}/UNIDADES/${selectedUnidad}/PUESTOS/${id}`));
        await loadPuestos(selectedCliente!, selectedUnidad!);
      }
      UI.toast('Eliminado correctamente', 'success');
    } catch (e) {
      UI.toast('Error al eliminar', 'error');
    } finally {
      UI.hideLoader();
    }
  }, 'danger', 'Eliminar');
}
