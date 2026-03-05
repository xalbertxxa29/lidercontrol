import { UI } from '../ui';
import { db, functions } from '../firebase';
import { accessControl } from '../access-control';
import { collection, getDocs, doc, setDoc, deleteDoc, query, limit, where, orderBy, startAfter, QueryConstraint, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getAllClientes, getUnidadesByCliente, fillSelect as utilFillSelect } from '../utils';
import Choices from 'choices.js';

let usersPage = 1;
const ITEMS_PER_PAGE = 10;
let currentUsers: any[] = [];
let lastVisibleDoc: any = null;
let pageDocs: any[] = []; // Cache de documentos para navegación suave
let editingUserId: string | null = null;
let choicesInstances: Record<string, Choices> = {};

export async function initUsuariosView() {
  const container = document.getElementById('view-usuarios');
  if (!container) return;

  if (!accessControl.canManageUsers()) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Acceso Denegado</div>
        <div class="empty-sub">No tienes los permisos necesarios para ver esta sección.</div>
      </div>
    `;
    return;
  }

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Gestión de Usuarios</h2>
        <h4 class="muted">Administra los accesos y roles del personal</h4>
      </div>
      <div>
        <button class="btn btn-primary" id="btnNuevoUsuario">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Usuario
        </button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="table-controls">
        <div class="filter-group" style="flex: 2;">
          <input type="text" id="filtroUserBusca" placeholder="ID exacto o Email..." class="search-input" />
        </div>
        <div class="filter-group">
          <select id="filtroUserCliente"><option value="">Todos los clientes</option></select>
        </div>
        <div class="filter-group">
          <select id="filtroUserUnidad"><option value="">Todas las unidades</option></select>
        </div>
        <div class="filter-group">
          <select id="filtroUserTipo">
            <option value="">Todos los roles</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="AGENTE">Agente</option>
            <option value="CLIENTE">Cliente</option>
          </select>
        </div>
        <div class="filter-group">
          <select id="filtroUserEstado">
            <option value="">Todos los estados</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary" id="btnBuscarUsuarios">Buscar</button>
          <button class="btn btn-secondary" id="btnLimpiarUserFiltros" style="height: 38px;">Limpiar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table id="tableUsuarios">
          <thead>
            <tr>
              <th>ID User</th>
              <th>Nombres</th>
              <th>Apellidos</th>
              <th>Cliente</th>
              <th>Unidad</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th style="text-align:right">Acciones</th>
            </tr>
          </thead>
          <tbody id="usersTbody">
            <tr><td colspan="8" style="text-align:center;padding:30px">Realice una búsqueda para ver usuarios registrados.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="page-info" id="page-info-users">Página 1</span>
        <button class="btn btn-secondary btn-sm" id="btn-prev-users" disabled>Anterior</button>
        <button class="btn btn-secondary btn-sm" id="btn-next-users" disabled>Siguiente</button>
      </div>
    </div>

    </div>
 
    <!-- Modal Registrar/Editar Usuario -->
    <div class="modal" id="editUserModal" aria-hidden="true" role="dialog" aria-modal="true">
      <div class="modal-box" style="max-width: 700px; padding: 0; overflow: hidden; background: var(--bg-2); border: 1px solid var(--border);">
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center;">
          <h2 id="editTitle" style="margin:0; font-size: 18px; color: var(--text);">Editar Usuario</h2>
          <button type="button" class="btn-close" id="editUserCloseX" style="background:none; border:none; color: var(--text-muted); cursor:pointer; font-size: 20px;">&times;</button>
        </div>
        
        <form id="editUserForm" style="padding: 24px;">
          <div class="grid-2" style="gap: 20px;">
            <div class="form-group" id="groupEditUserId" style="display:none">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">ID Usuario (Email/Username)</label>
              <input type="text" id="editUserId" class="form-input" placeholder="ej: jsolis" />
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Nombres</label>
              <input type="text" id="editUserNombres" required class="form-input" placeholder="Nombres del personal" />
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Apellidos</label>
              <input type="text" id="editUserApellidos" required class="form-input" placeholder="Apellidos del personal" />
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Email</label>
              <input type="email" id="editUserEmail" required class="form-input" placeholder="usuario@liderman.com.pe" />
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Cliente</label>
              <select id="editUserCliente" class="form-input"><option value="">Seleccione Cliente</option></select>
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Unidad</label>
              <select id="editUserUnidad" class="form-input"><option value="">Seleccione Unidad</option></select>
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Tipo de Acceso</label>
              <select id="editUserTipo" required class="form-input">
                <option value="AGENTE">AGENTE</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CLIENTE">CLIENTE</option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="filter-label" style="display:block; margin-bottom: 8px;">Estado</label>
              <select id="editUserEstado" required class="form-input">
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>
          </div>
          
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" class="btn btn-secondary" id="editUserCancel">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="editUserSave" style="min-width: 120px;">Guardar cambios</button>
          </div>
        </form>
      </div>
    </div>
  `;

  setupFiltersAndEvents();
  await populateInitialFilters();
}

async function populateInitialFilters() {
  try {
    const clientes = await getAllClientes();
    utilFillSelect(document.getElementById('filtroUserCliente') as HTMLSelectElement, clientes, 'Todos los clientes');
    utilFillSelect(document.getElementById('editUserCliente') as HTMLSelectElement, clientes, 'Seleccione Cliente');

    const choicesConfig: any = {
      searchEnabled: true,
      shouldSort: true,
      itemSelectText: '',
      noResultsText: 'No se encontraron resultados',
      noChoicesText: 'No hay opciones disponibles',
      placeholder: true
    };

    const selCliente = document.getElementById('editUserCliente') as HTMLSelectElement;
    const selUnidad = document.getElementById('editUserUnidad') as HTMLSelectElement;

    if (selCliente) choicesInstances['editUserCliente'] = new Choices(selCliente, choicesConfig);
    if (selUnidad) choicesInstances['editUserUnidad'] = new Choices(selUnidad, choicesConfig);

    selCliente.addEventListener('change', async (e: any) => {
      const cli = e.detail.value;
      const unidades = cli ? await getUnidadesByCliente(cli) : [];

      const choiceUnidad = choicesInstances['editUserUnidad'];
      if (choiceUnidad) {
        choiceUnidad.clearStore();
        choiceUnidad.setChoices([
          { value: '', label: 'Seleccione Unidad', selected: true, disabled: false },
          ...unidades.map(u => ({ value: u, label: u }))
        ], 'value', 'label', true);
      }
    });

    document.getElementById('filtroUserCliente')?.addEventListener('change', async (e) => {
      const cli = (e.target as HTMLSelectElement).value;
      const unidades = cli ? await getUnidadesByCliente(cli) : [];
      utilFillSelect(document.getElementById('filtroUserUnidad') as HTMLSelectElement, unidades, 'Todas las unidades');
    });

  } catch (e) {
    console.error("Error populating initial filters", e);
  }
}

async function fetchUsers(reset = false) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (reset) {
    usersPage = 1;
    lastVisibleDoc = null;
    pageDocs = [];
  }

  UI.showLoader('Buscando usuarios...', 'Consultando la base de datos', 40);
  try {
    const searchVal = (document.getElementById('filtroUserBusca') as HTMLInputElement).value.trim();
    const cliente = (document.getElementById('filtroUserCliente') as HTMLSelectElement).value;
    const unidad = (document.getElementById('filtroUserUnidad') as HTMLSelectElement).value;
    const tipo = (document.getElementById('filtroUserTipo') as HTMLSelectElement).value;
    const estado = (document.getElementById('filtroUserEstado') as HTMLSelectElement).value;

    const constraints: QueryConstraint[] = [];

    // Si hay búsqueda por ID, priorizarla (búsqueda por ID de documento es muy eficiente)
    if (searchVal) {
      if (searchVal.includes('@')) {
        constraints.push(where('EMAIL', '==', searchVal));
      } else {
        // Para ID de documento exacto, probaremos obtenerlo directamente o por campo si existe
        // Como 'id' en Firestore suele ser el nombre del documento, si es búsqueda por ID:
        const docRef = doc(db, 'USUARIOS', searchVal);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          currentUsers = [{ id: docSnap.id, ...docSnap.data() }];
          renderUsers(currentUsers);
          UI.hideLoader();
          return;
        }
        // Si no es ID exacto, intentamos prefix si es posible, o simplemente seguimos con otros filtros
        // Para este sistema, asumiremos que searchVal busca en NOMBRES o APELLIDOS si no es ID
      }
    }

    if (cliente) constraints.push(where('CLIENTE', '==', cliente));
    if (unidad) constraints.push(where('UNIDAD', '==', unidad));
    if (tipo) constraints.push(where('TIPO', '==', tipo));
    if (estado) constraints.push(where('ESTADO', '==', estado));

    if (accessControl?.isSupervisor()) {
      constraints.push(where('TIPO', '!=', 'ADMIN'));
    }

    let q = query(collection(db, 'USUARIOS'), ...constraints, orderBy('TIPO'), limit(ITEMS_PER_PAGE));

    if (lastVisibleDoc && !reset) {
      q = query(q, startAfter(lastVisibleDoc));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      currentUsers = [];
      if (reset) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">No se encontraron resultados.</td></tr>';
      }
    } else {
      lastVisibleDoc = snap.docs[snap.docs.length - 1];
      if (reset) pageDocs = [null]; // Marcador para la primera página
      pageDocs[usersPage] = lastVisibleDoc;

      currentUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderUsers(currentUsers);
    }
  } catch (e) {
    console.error("Error fetching users", e);
    UI.toast('Error en la búsqueda de usuarios.', 'error');
  } finally {
    UI.hideLoader();
  }
}

function renderUsers(list: any[]) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">No se encontraron registros.</td></tr>';
  } else {
    const frag = document.createDocumentFragment();
    list.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
                <td>${u.id || ''}</td>
                <td>${u.NOMBRES || ''}</td>
                <td>${u.APELLIDOS || ''}</td>
                <td>${u.CLIENTE || ''}</td>
                <td>${u.UNIDAD || ''}</td>
                <td><span class="badge badge-info">${u.TIPO || u.TIPOACCESO || ''}</span></td>
                <td><span class="badge ${u.ESTADO === 'ACTIVO' ? 'badge-success' : 'badge-danger'}">${u.ESTADO || ''}</span></td>
                <td class="row-actions" style="text-align:right">
                    <button class="btn small secondary" data-act="edit" data-id="${u.id}">Editar</button>
                    ${(accessControl.state && (accessControl.state.userType === 'ADMIN' || accessControl.state.userType === 'SUPERVISOR')) ?
          `<button class="btn small" style="background:#f59e0b; color: white; border:none; margin-left:4px;" data-act="reset" data-id="${u.id}" title="Restablecer">🔑</button>` : ''}
                    <button class="btn small" style="background:var(--danger); color:white; border:none; margin-left:4px;" data-act="del" data-id="${u.id}">Eliminar</button>
                </td>
            `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  const btnPrev = document.getElementById('btn-prev-users') as HTMLButtonElement;
  const btnNext = document.getElementById('btn-next-users') as HTMLButtonElement;
  const pageInfo = document.getElementById('page-info-users');

  if (btnPrev && btnNext && pageInfo) {
    btnPrev.disabled = usersPage === 1;
    btnNext.disabled = list.length < ITEMS_PER_PAGE;
    pageInfo.textContent = `Página ${usersPage}`;
  }
}

// Obsolete client-side functions removed

function setupFiltersAndEvents() {
  const searchInput = document.getElementById('filtroUserBusca') as HTMLInputElement;
  const btnBuscar = document.getElementById('btnBuscarUsuarios');
  const btnLimpiar = document.getElementById('btnLimpiarUserFiltros');

  if (btnBuscar) btnBuscar.addEventListener('click', () => fetchUsers(true));
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') fetchUsers(true);
    });
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      (document.getElementById('filtroUserCliente') as HTMLSelectElement).value = '';
      (document.getElementById('filtroUserUnidad') as HTMLSelectElement).value = '';
      (document.getElementById('filtroUserTipo') as HTMLSelectElement).value = '';
      (document.getElementById('filtroUserEstado') as HTMLSelectElement).value = '';
      usersPage = 1;
      lastVisibleDoc = null;
      document.getElementById('usersTbody')!.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px">Realice una búsqueda para ver usuarios registrados.</td></tr>';
      (document.getElementById('btn-prev-users') as HTMLButtonElement).disabled = true;
      (document.getElementById('btn-next-users') as HTMLButtonElement).disabled = true;
      document.getElementById('page-info-users')!.textContent = 'Página 1';
    });
  }

  document.getElementById('btn-prev-users')?.addEventListener('click', () => {
    // Para retroceder con startAfter/limit en Firestore es complejo sin caching manual de snapshots.
    // Una alternativa es resetear y avanzar hasta la página N-1, pero es ineficiente.
    // Mantendremos usersPage y lastVisibleDoc relacional.
    if (usersPage > 1) {
      usersPage--;
      lastVisibleDoc = pageDocs[usersPage - 1]; // Recuperamos el cursor de la página anterior
      fetchUsers(false);
    }
  });

  document.getElementById('btn-next-users')?.addEventListener('click', () => {
    usersPage++;
    fetchUsers(false);
  });

  // Table Actions
  const tbody = document.getElementById('usersTbody');
  if (tbody) {
    tbody.addEventListener('click', async (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
      if (!btn) return;

      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (!id) return;

      if (act === 'del') {
        UI.dialog('Eliminar usuario', `¿Deseas eliminar permanentemente al usuario "${id}"? Se borrará de la base de datos y de la autenticación.`, async () => {
          UI.showLoader('Eliminando...', 'Borrando datos en base de datos y Auth', 20);
          try {
            const delFn = httpsCallable(functions, 'adminDeleteUser');
            await delFn({ targetUid: id });

            currentUsers = currentUsers.filter(x => x.id !== id);
            renderUsers(currentUsers);
            UI.toast('Usuario eliminado del sistema.');
          } catch (e) {
            console.error('Del User Err', e);
            UI.toast('No se pudo eliminar el usuario completamente.', 'error');
          } finally {
            UI.hideLoader();
          }
        }, 'danger', 'Eliminar Definitivamente');
      } else if (act === 'edit') {
        const u = currentUsers.find(x => x.id === id);
        if (!u) return;

        const editUserIdInput = document.getElementById('editUserId') as HTMLInputElement;
        const groupEditUserId = document.getElementById('groupEditUserId') as HTMLElement;
        const editNombres = document.getElementById('editUserNombres') as HTMLInputElement;
        const editApellidos = document.getElementById('editUserApellidos') as HTMLInputElement;
        const editEmail = document.getElementById('editUserEmail') as HTMLInputElement;
        const editCliente = document.getElementById('editUserCliente') as HTMLSelectElement;
        const editUnidad = document.getElementById('editUserUnidad') as HTMLSelectElement;
        const editTipo = document.getElementById('editUserTipo') as HTMLSelectElement;
        const editEstado = document.getElementById('editUserEstado') as HTMLSelectElement;
        const editTitle = document.getElementById('editTitle');

        if (editTitle) editTitle.textContent = 'Editar Usuario';
        if (groupEditUserId) groupEditUserId.style.display = 'none';
        if (editUserIdInput) editUserIdInput.required = false;

        editNombres.value = u.NOMBRES || '';
        editApellidos.value = u.APELLIDOS || '';
        editEmail.value = u.EMAIL || u.CORREO || u.email || '';

        // Update Choices instances
        if (choicesInstances['editUserCliente']) {
          choicesInstances['editUserCliente'].setChoiceByValue(u.CLIENTE || '');
          // Trigger change to load units
          const cli = u.CLIENTE || '';
          const unidades = cli ? await getUnidadesByCliente(cli) : [];
          if (choicesInstances['editUserUnidad']) {
            choicesInstances['editUserUnidad'].clearStore();
            choicesInstances['editUserUnidad'].setChoices([
              { value: '', label: 'Seleccione Unidad', selected: !u.UNIDAD, disabled: false },
              ...unidades.map(v => ({ value: v, label: v, selected: v === u.UNIDAD }))
            ], 'value', 'label', true);
          }
        }

        editTipo.value = u.TIPO || u.TIPOACCESO || 'AGENTE';
        editEstado.value = u.ESTADO || 'ACTIVO';

        editingUserId = id;

        const modal = document.getElementById('editUserModal');
        if (modal) modal.classList.add('show');
      } else if (act === 'reset') {
        const u = currentUsers.find(x => x.id === id);
        if (!u) return;

        const modalReset = document.getElementById('modalResetPwd');
        const targetLabel = document.getElementById('resetPwdTarget');
        const pwdInput = document.getElementById('modalResetPwdInput') as HTMLInputElement;

        if (targetLabel) targetLabel.textContent = id;
        if (pwdInput) pwdInput.value = '';

        if (modalReset) modalReset.classList.add('show');

        const saveBtn = document.getElementById('btnModalResetPwdSave');
        if (saveBtn) {
          saveBtn.onclick = async () => {
            const newPwd = pwdInput.value.trim();
            if (newPwd.length < 6) {
              UI.toast('La contraseña debe tener al menos 6 caracteres.', 'warning');
              return;
            }

            UI.showLoader('Actualizando...', 'Cambiando contraseña en el servidor', 30);
            try {
              const resetFn = httpsCallable(functions, 'adminResetPassword');
              await resetFn({ targetUid: id, newPassword: newPwd });
              UI.toast('Contraseña actualizada correctamente.');
              modalReset?.classList.remove('show');
            } catch (err) {
              console.error('Reset Pwd Error', err);
              UI.toast('Error al cambiar la contraseña.', 'error');
            } finally {
              UI.hideLoader();
            }
          };
        }
      }
    });
  }

  // Modal Edit logic
  const editCancelBtn = document.getElementById('editUserCancel');
  const editForm = document.getElementById('editUserForm') as HTMLFormElement;
  const modal = document.getElementById('editUserModal');

  if (editCancelBtn && modal) {
    editCancelBtn.addEventListener('click', () => {
      modal?.classList.remove('show');
      editingUserId = null;
    });
  }

  const closeX = document.getElementById('editUserCloseX');
  if (closeX && modal) {
    closeX.addEventListener('click', () => {
      modal.classList.remove('show');
      editingUserId = null;
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const editUserIdInput = (document.getElementById('editUserId') as HTMLInputElement).value.trim();
      const editNombres = (document.getElementById('editUserNombres') as HTMLInputElement).value.trim();
      const editApellidos = (document.getElementById('editUserApellidos') as HTMLInputElement).value.trim();
      const editEmail = (document.getElementById('editUserEmail') as HTMLInputElement).value.trim();
      const editCliente = (document.getElementById('editUserCliente') as HTMLSelectElement).value;
      const editUnidad = (document.getElementById('editUserUnidad') as HTMLSelectElement).value;
      const editTipo = (document.getElementById('editUserTipo') as HTMLSelectElement).value;
      const editEstado = (document.getElementById('editUserEstado') as HTMLSelectElement).value;

      const payload = {
        NOMBRES: editNombres,
        APELLIDOS: editApellidos,
        EMAIL: editEmail,
        CORREO: editEmail,
        CLIENTE: editCliente,
        UNIDAD: editUnidad,
        TIPO: editTipo,
        TIPOACCESO: editTipo,
        ESTADO: editEstado
      };

      const finalId = editingUserId || editUserIdInput || editEmail.split('@')[0].toLowerCase();
      if (!finalId) { UI.toast('ID de usuario no válido', 'error'); return; }

      UI.showLoader('Guardando...', 'Actualizando información en base de datos', 10);
      try {
        await setDoc(doc(db, 'USUARIOS', finalId), payload, { merge: true });

        if (editingUserId) {
          const u = currentUsers.find(x => x.id === editingUserId);
          if (u) Object.assign(u, payload);
          renderUsers(currentUsers);
        } else {
          fetchUsers(true);
        }
        UI.toast('Usuario actualizado exitosamente.');
        modal?.classList.remove('show');
        editingUserId = null;
      } catch (e) {
        console.error("Error saving user", e);
        UI.toast('No se pudo actualizar la información.', 'error');
      } finally {
        UI.hideLoader();
      }
    });
  }

  document.getElementById('btnNuevoUsuario')?.addEventListener('click', () => {
    editingUserId = null;
    const form = document.getElementById('editUserForm') as HTMLFormElement;
    if (form) form.reset();

    const editTitle = document.getElementById('editTitle');
    const groupEditUserId = document.getElementById('groupEditUserId') as HTMLElement;
    const editUserIdInput = document.getElementById('editUserId') as HTMLInputElement;

    if (editTitle) editTitle.textContent = 'Registrar Nuevo Usuario';
    if (groupEditUserId) groupEditUserId.style.display = 'block';
    if (editUserIdInput) editUserIdInput.required = true;

    // Reset Choices
    if (choicesInstances['editUserCliente']) choicesInstances['editUserCliente'].setChoiceByValue('');
    if (choicesInstances['editUserUnidad']) {
      choicesInstances['editUserUnidad'].clearStore();
      choicesInstances['editUserUnidad'].setChoices([{ value: '', label: 'Seleccione Unidad', selected: true }], 'value', 'label', true);
    }

    if (modal) modal.classList.add('show');
  });
}
