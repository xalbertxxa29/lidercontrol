export function initModals() {
  const modalsContainer = document.createElement('div');
  modalsContainer.id = 'modals-container';

  modalsContainer.innerHTML = `
    <!-- Modal: Editar Usuario -->
    <div class="modal" id="modalEditarUsuario">
      <div class="modal-box" style="max-width:500px">
        <div class="modal-header">
          <h3>Editar Usuario</h3>
          <button class="modal-close" onclick="document.getElementById('modalEditarUsuario').classList.remove('show')">&times;</button>
        </div>
        <div class="modal-body form-grid">
          <div class="form-group full">
            <label>Nombres</label>
            <input type="text" id="modalUserNombres" placeholder="Nombres" />
          </div>
          <div class="form-group full">
            <label>Apellidos</label>
            <input type="text" id="modalUserApellidos" placeholder="Apellidos" />
          </div>
          <div class="form-group">
            <label>Cliente</label>
            <select id="modalUserCliente"><option value="">Seleccione</option></select>
          </div>
          <div class="form-group">
            <label>Unidad</label>
            <select id="modalUserUnidad"><option value="">Seleccione</option></select>
          </div>
          <div class="form-group">
            <label>Rol</label>
            <select id="modalUserRol">
              <option value="ADMIN">ADMIN</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="AGENTE">AGENTE</option>
              <option value="CLIENTE">CLIENTE</option>
            </select>
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select id="modalUserEstado">
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modalEditarUsuario').classList.remove('show')">Cancelar</button>
          <button class="btn btn-primary" id="btnModalUserSave">Guardar Cambios</button>
        </div>
      </div>
    </div>

    <!-- Modal: Agregar Cliente/Unidad/Puesto -->
    <div class="modal" id="modalAddCU">
      <div class="modal-box" style="max-width:400px">
        <div class="modal-header">
          <h3 id="modalAddCUTitle">Agregar Elemento</h3>
          <button class="modal-close" onclick="document.getElementById('modalAddCU').classList.remove('show')">&times;</button>
        </div>
        <div class="modal-body form-grid">
          <div class="form-group full">
            <label id="modalAddCULabel">Nombre</label>
            <input type="text" id="modalAddCUInput" placeholder="Ej. Nuevo Cliente S.A." />
          </div>
          <div class="form-group full" id="modalAddCUSelectContainer" style="display:none">
            <label id="modalAddCUSelectLabel">Depende de</label>
            <select id="modalAddCUSelect"></select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modalAddCU').classList.remove('show')">Cancelar</button>
          <button class="btn btn-primary" id="btnModalAddCUSave">Aceptar</button>
        </div>
      </div>
    </div>

    <!-- Modal: QR Map Viewer -->
    <div class="modal" id="modalQRMap">
      <div class="modal-box" style="max-width:800px; width:90%">
        <div class="modal-header">
          <h3>Mapa de Puntos de Control</h3>
          <button class="modal-close" onclick="document.getElementById('modalQRMap').classList.remove('show')">&times;</button>
        </div>
        <div class="modal-body" style="padding:0">
          <div id="modalLeafletMap" style="height:500px; width:100%; border-bottom-left-radius:12px; border-bottom-right-radius:12px"></div>
        </div>
      </div>
    </div>

    <!-- Modal: Reset Password -->
    <div class="modal" id="modalResetPwd">
      <div class="modal-box" style="max-width:400px">
        <div class="modal-header">
          <h3>Resetear Contraseña</h3>
          <button class="modal-close" onclick="document.getElementById('modalResetPwd').classList.remove('show')">&times;</button>
        </div>
        <div class="modal-body form-grid">
           <p style="margin-bottom:12px; font-size:14px; color:var(--text-muted)">Ingresa la nueva contraseña para el usuario <strong id="resetPwdTarget"></strong></p>
           <div class="form-group full">
             <label>Nueva Contraseña</label>
             <input type="password" id="modalResetPwdInput" placeholder="Mínimo 6 caracteres" />
           </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('modalResetPwd').classList.remove('show')">Cancelar</button>
          <button class="btn btn-danger" id="btnModalResetPwdSave">Actualizar Contraseña</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalsContainer);

  // Initialize event bindings for global modals here
  // ...
}
