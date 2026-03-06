import { UI } from '../ui';
import { db } from '../firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { masterCache } from '../cache-service';

const COLLECTIONS = {
  CLIENT_UNITS: 'CLIENTE_UNIDAD',
  INCIDENT_TYPES: 'TIPO_INCIDENCIAS'
};

let currentCatId: string | null = null;

export async function initTipoIncidenciasView() {
  const container = document.getElementById('view-tipo-incidencias');
  if (!container) return;

  if (container.innerHTML.trim() !== '') return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Tipo de Incidencias</h2>
        <h4 class="muted">Gestión de categorías y subcategorías</h4>
      </div>
    </div>

    <div class="card card-pad">
      <div class="filters-bar" style="padding:0 0 16px 0; display:flex; gap:10px; align-items:flex-end;">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">Cliente</label>
          <select id="filtroTipoCliente" class="form-input"><option value="">Seleccione Cliente</option></select>
        </div>
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">Unidad</label>
          <select id="filtroTipoUnidad" class="form-input" disabled><option value="">Seleccione Unidad</option></select>
        </div>
        <div class="filter-group" style="flex:0;">
          <button class="btn btn-primary" id="btnCargarTipos" style="white-space:nowrap; height:38px;">🔍 Cargar Tipos</button>
        </div>
      </div>
      
      <div class="grid-2" id="tiposContent" style="display:none; margin-top:20px; gap:20px;">
        <div class="card" style="border:1px solid rgba(255,255,255,0.06); background:var(--card-bg); height: 500px; display:flex; flex-direction:column;">
          <div class="card-header" style="justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px; margin-bottom:0;">
            <h3 class="card-title" style="margin:0;">Categorías</h3>
            <button class="btn btn-secondary btn-sm" id="btnNuevaCategoria">+ Nueva</button>
          </div>
          <div class="card-pad" id="listaCategorias" style="flex:1; overflow-y:auto; padding:0;">
             <div class="empty-state">Seleccione unidad y cargue los tipos</div>
          </div>
        </div>

        <div class="card" id="detailsCard" style="border:1px solid rgba(255,255,255,0.06); background:var(--card-bg); height: 500px; display:none; flex-direction:column;">
          <div class="card-header" style="justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
            <div>
               <h3 class="card-title" id="tituloSubcategoria" style="margin:0;">Detalle</h3>
               <small class="muted">Lista de sub-tipos habilitados</small>
            </div>
            <button class="btn btn-sm" id="btnBorrarCategoria" style="background:var(--danger); color:white; border:none;" title="Eliminar Categoría Completa">🗑️ Eliminar</button>
          </div>
          <div class="card-pad" style="flex:1; overflow-y:auto; padding-top:10px;">
             <ul id="listaSubcategorias" style="list-style:none; padding:0; margin:0 0 20px 0;"></ul>
             
             <form id="formAddSubtipo" style="display:flex; gap:10px; margin-top:auto;" autocomplete="off">
                 <input type="text" id="inputNewSubtipo" class="form-input" placeholder="Nombre del sub-tipo..." style="flex:1;" required/>
                 <button type="submit" class="btn btn-secondary">Agregar</button>
             </form>
          </div>
        </div>
      </div>
    </div>
  `;

  setupEvents();
  loadClientes();
}

async function loadClientes() {
  const selCli = document.getElementById('filtroTipoCliente') as HTMLSelectElement;
  if (!selCli) return;

  try {
    const data = await masterCache.getClientUnits();
    const clientes: string[] = Object.keys(data).sort();

    selCli.innerHTML = '<option value="">Seleccione Cliente</option>' +
      clientes.map(c => `<option value="${c}">${c}</option>`).join('');
  } catch (e) {
    console.error(e);
    UI.toast('Error cargando clientes', 'error');
  }
}

function setupEvents() {
  const selCli = document.getElementById('filtroTipoCliente') as HTMLSelectElement;
  const selUni = document.getElementById('filtroTipoUnidad') as HTMLSelectElement;
  const btnCargar = document.getElementById('btnCargarTipos') as HTMLButtonElement;
  const tiposContent = document.getElementById('tiposContent') as HTMLElement;
  const detailsCard = document.getElementById('detailsCard') as HTMLElement;
  const listCat = document.getElementById('listaCategorias') as HTMLElement;
  const listSub = document.getElementById('listaSubcategorias') as HTMLElement;
  const titleSub = document.getElementById('tituloSubcategoria') as HTMLElement;

  selCli?.addEventListener('change', async () => {
    const cli = selCli.value;
    selUni.innerHTML = '<option value="">Cargando...</option>';
    selUni.disabled = true;

    if (!cli) {
      selUni.innerHTML = '<option value="">Seleccione Unidad</option>';
      return;
    }

    try {
      const data = await masterCache.getClientUnits();
      const unidades: string[] = (data[cli] || []).sort();

      selUni.innerHTML = '<option value="">Seleccione Unidad</option>' +
        unidades.map(u => `<option value="${u}">${u}</option>`).join('');
      selUni.disabled = false;
    } catch (e) {
      UI.toast('Error cargando unidades', 'error');
      selUni.innerHTML = '<option value="">Error</option>';
    }
  });

  btnCargar?.addEventListener('click', async () => {
    const cli = selCli.value;
    const uni = selUni.value;
    if (!cli || !uni) return UI.toast('Seleccione Cliente y Unidad primero', 'warning');

    UI.showLoader('Cargando Tipos...', 'Buscando incidencias configuradas', 15);
    tiposContent.style.display = 'none';

    try {
      const snap = await getDocs(collection(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO`));
      renderCategorias(snap.docs);
      tiposContent.style.display = 'grid';
      detailsCard.style.display = 'none';
    } catch (e) {
      UI.toast('Error consultando tipos', 'error');
    } finally {
      UI.hideLoader();
    }
  });

  function renderCategorias(docs: any[]) {
    if (docs.length === 0) {
      listCat.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;">No hay categorías configuradas.</div>';
      return;
    }

    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none; padding:0; margin:0;';

    docs.forEach(doc => {
      const data = doc.data();
      const li = document.createElement('li');
      li.style.cssText = 'padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;';
      li.innerHTML = `
                <span style="font-weight:500;">${doc.id}</span>
                <span class="badge badge-info">${(data.DETALLES || []).length} items</span>
            `;

      li.onclick = () => {
        Array.from(ul.children).forEach((c: any) => c.style.background = 'transparent');
        li.style.background = 'rgba(255,255,255,0.05)';
        loadSubcategorias(doc);
      };

      ul.appendChild(li);
    });

    listCat.innerHTML = '';
    listCat.appendChild(ul);
  }

  function loadSubcategorias(docSnap: any) {
    currentCatId = docSnap.id;
    const data = docSnap.data();
    const detalles: string[] = data.DETALLES || [];

    titleSub.textContent = currentCatId || 'Detalle';
    detailsCard.style.display = 'flex';
    listSub.innerHTML = '';

    if (detalles.length === 0) {
      listSub.innerHTML = '<li class="muted" style="padding:10px; font-style:italic;">Sin sub-tipos registrados.</li>';
    } else {
      detalles.forEach(sub => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:10px 0; border-bottom:1px dashed rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;';

        li.innerHTML = `<span>${sub}</span>`;

        const btnDel = document.createElement('button');
        btnDel.innerHTML = '✕';
        btnDel.className = 'btn small';
        btnDel.style.cssText = 'background:transparent; color:var(--danger); padding:4px 8px; font-weight:bold; cursor:pointer; border:none;';
        btnDel.onclick = () => {
          UI.dialog('Eliminar sub-tipo', `¿Quitar "${sub}" de la lista?`, () => deleteSubcategoria(sub), 'warning', 'Eliminar');
        };

        li.appendChild(btnDel);
        listSub.appendChild(li);
      });
    }
  }

  // Agregar Categoría
  document.getElementById('btnNuevaCategoria')?.addEventListener('click', async () => {
    const cli = selCli.value;
    const uni = selUni.value;
    if (!cli || !uni) return UI.toast('Seleccione Cliente y Unidad', 'warning');

    const name = prompt('Nombre de la Nueva Categoría (ej. ROBO o ASISTENCIA):');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().toUpperCase();

    UI.showLoader('Creando...', 'Creando categoría', 10);
    try {
      const path = `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO`;
      await setDoc(doc(db, path, cleanName), { DETALLES: [], actualizadoEn: serverTimestamp() }, { merge: true });
      UI.toast('Categoría creada');
      btnCargar.click();
    } catch (e) {
      UI.toast('Error al crear', 'error');
    } finally {
      UI.hideLoader();
    }
  });

  // Eliminar Categoría
  document.getElementById('btnBorrarCategoria')?.addEventListener('click', () => {
    if (!currentCatId) return;
    UI.dialog('Borrar Categoría', `¿Estás seguro de eliminar la categoría "${currentCatId}" y todos sus detalles? Esta acción es irreversible.`, async () => {
      const cli = selCli.value;
      const uni = selUni.value;

      UI.showLoader('Eliminando...', '', 10);
      try {
        await deleteDoc(doc(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO/${currentCatId}`));
        UI.toast('Categoría eliminada');
        detailsCard.style.display = 'none';
        currentCatId = null;
        btnCargar.click();
      } catch (e) { UI.toast('Error eliminando', 'error'); }
      finally { UI.hideLoader(); }

    }, 'danger', 'Borrar permanentemente');
  });

  // Agregar subcategoría
  document.getElementById('formAddSubtipo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCatId) return;

    const input = document.getElementById('inputNewSubtipo') as HTMLInputElement;
    const val = input.value.trim().toUpperCase();
    if (!val) return;

    const cli = selCli.value;
    const uni = selUni.value;

    UI.showLoader('Guardando...', 'Añadiendo sub-tipo', 10);
    try {
      const docRef = doc(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO/${currentCatId}`);
      await updateDoc(docRef, { DETALLES: arrayUnion(val), actualizadoEn: serverTimestamp() });

      UI.toast('Sub-tipo agregado');
      input.value = '';

      // Reload sublist specifically
      // To do this we need to fetch the doc again:
      const snap = await getDocs(collection(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO`));
      const updatedDoc = snap.docs.find(d => d.id === currentCatId);
      if (updatedDoc) loadSubcategorias(updatedDoc);

    } catch (e) { UI.toast('Error guardando', 'error'); }
    finally { UI.hideLoader(); }
  });

  async function deleteSubcategoria(subName: string) {
    const cli = selCli.value;
    const uni = selUni.value;
    if (!currentCatId) return;

    UI.showLoader('Actualizando...', '', 10);
    try {
      const docRef = doc(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO/${currentCatId}`);
      await updateDoc(docRef, { DETALLES: arrayRemove(subName), actualizadoEn: serverTimestamp() });
      UI.toast('Sub-tipo quitado');

      const snap = await getDocs(collection(db, `${COLLECTIONS.INCIDENT_TYPES}/${cli}/UNIDADES/${uni}/TIPO`));
      const updatedDoc = snap.docs.find(d => d.id === currentCatId);
      if (updatedDoc) loadSubcategorias(updatedDoc);
    } catch (e) { UI.toast('Error eliminando', 'error'); }
    finally { UI.hideLoader(); }
  }
}
