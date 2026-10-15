// js/panel/panel.js — CRUD completo para administrador y empleado + estado de pago
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { calcularMontoServicio, formatearSoles, generarCodigoSeguimiento, redondear } from '../registro/tarifario.js';
import { validarDNI } from '../pago/validaciones.js';
import {
  prepararCabecera, celda, etiqueta, filaVacia, animarFilas, mostrarConfirmacion, confirmar, aviso, animarContador
} from '../ui/ui.js';

// 1. Control de acceso: solo administrador o empleado
const usuario = exigirRol('administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

const tabla = document.querySelector('#tabla-panel');
const form = document.querySelector('#form-panel');
const btnCancel = document.querySelector('#pnl-btn-cancel');
const btnSubmit = document.querySelector('#pnl-btn-submit');
const inputGiro = document.querySelector('#pnl-giro');
const salidaComision = document.querySelector('#pnl-comision');
const error = document.querySelector('#pnl-error');
const zonaConfirmacion = document.querySelector('#pnl-confirmacion');
const filtroTexto = document.querySelector('#filtro-texto');
const filtroPago = document.querySelector('#filtro-pago');

let cacheRegistros = [];

/* =========================================================
   A. DATOS — operaciones en Neon
   ========================================================= */

// Consultar — todos los registros, sin filtro por usuario
export async function listarTodos() {
  return await sql`
    SELECT id, codigo_seguimiento, beneficiario, dni, programa, estado, id_usuario,
           monto_giro, monto_calculado, estado_pago, canal_pago
    FROM inscripciones_programas_sociales
    ORDER BY id DESC;
  `;
}

// Crear — atención presencial o telefónica: id_usuario queda en NULL
export async function crearRegistro(datos) {
  const codigo = generarCodigoSeguimiento();
  const monto = calcularMontoServicio(datos);
  await sql`
    INSERT INTO inscripciones_programas_sociales
      (codigo_seguimiento, beneficiario, dni, programa, estado, id_usuario,
       monto_giro, monto_calculado, estado_pago)
    VALUES (${codigo}, ${datos.beneficiario}, ${datos.dni}, ${datos.programa}, ${datos.estado}, NULL,
            ${redondear(Number(datos.monto_giro) || 0)}, ${monto}, ${monto === 0 ? 'exonerado' : 'pendiente'});
  `;
  return codigo; // el beneficiario presencial paga luego en caja.html buscando este código
}

// Actualizar — cualquier registro, incluido el estado operativo.
// Si la comisión ya fue pagada, el giro y el monto NO se modifican.
export async function actualizarCualquiera(id, datos) {
  const monto = calcularMontoServicio(datos);
  const giro = redondear(Number(datos.monto_giro) || 0);
  await sql`
    UPDATE inscripciones_programas_sociales
    SET beneficiario = ${datos.beneficiario}, dni = ${datos.dni}, programa = ${datos.programa},
        estado = ${datos.estado},
        monto_giro = CASE WHEN estado_pago = 'pagado' THEN monto_giro ELSE ${giro} END,
        monto_calculado = CASE WHEN estado_pago = 'pagado' THEN monto_calculado ELSE ${monto} END,
        estado_pago = CASE WHEN estado_pago = 'pagado' THEN 'pagado'
                           ELSE ${monto === 0 ? 'exonerado' : 'pendiente'} END
    WHERE id = ${id};
  `;
}

// Eliminar — se bloquea si la inscripción tiene historial de pagos
export async function eliminarRegistro(id) {
  try {
    await sql`DELETE FROM inscripciones_programas_sociales WHERE id = ${id};`;
    return { ok: true };
  } catch (err) {
    // 23503 = violación de llave foránea: la inscripción tiene pagos (aprobados o rechazados)
    if (err.code === '23503') {
      return { ok: false, mensaje: 'No se puede eliminar: tiene historial de pagos. Cambie su estado a "rechazado".' };
    }
    throw err;
  }
}

/* =========================================================
   B. INTERFAZ
   ========================================================= */

function boton(texto, accion, id, clase) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.className = `boton boton-mini ${clase}`;
  b.dataset.accion = accion;
  b.dataset.id = id;
  return b;
}

function pintarTabla() {
  const texto = filtroTexto.value.trim().toLowerCase();
  const pago = filtroPago.value;
  const registros = cacheRegistros.filter((r) =>
    (!pago || r.estado_pago === pago) &&
    (!texto || [r.codigo_seguimiento, r.beneficiario, r.dni].some((v) => String(v ?? '').toLowerCase().includes(texto)))
  );

  if (registros.length === 0) {
    filaVacia(tabla, 9, cacheRegistros.length ? 'Ningún registro coincide con el filtro.' : 'No hay registros cargados.');
    return;
  }

  tabla.replaceChildren();
  for (const r of registros) {
    const tr = document.createElement('tr');
    celda(tr, r.codigo_seguimiento ?? `#${r.id}`).className = 'codigo';
    celda(tr, r.beneficiario);
    celda(tr, r.dni);
    celda(tr, r.programa);
    const tdMonto = celda(tr, formatearSoles(r.monto_calculado));
    tdMonto.className = 'monto';
    const giro = document.createElement('small');
    giro.className = 'canal';
    giro.textContent = `giro ${formatearSoles(r.monto_giro)}`;
    tdMonto.append(giro);
    celda(tr).append(etiqueta(r.estado, r.estado));
    const tdPago = celda(tr);
    tdPago.append(etiqueta(r.estado_pago, r.estado_pago));
    if (r.canal_pago) {
      const canal = document.createElement('small');
      canal.className = 'canal';
      canal.textContent = r.canal_pago === 'pasarela' ? 'en línea' : 'en caja';
      tdPago.append(canal);
    }
    celda(tr).append(r.id_usuario ? etiqueta('Web (cliente)', 'web') : etiqueta('Presencial', 'presencial'));
    const acciones = document.createElement('div');
    acciones.className = 'celda-acciones';
    acciones.append(
      boton('Editar', 'editar', r.id, 'boton-editar'),
      boton('Eliminar', 'eliminar', r.id, 'boton-eliminar')
    );
    celda(tr).append(acciones);
    tabla.append(tr);
  }
  animarFilas(tabla); // Animación 2: entrada animada de la tabla
}

function pintarIndicadores() {
  const suma = (lista) => lista.reduce((s, r) => s + Number(r.monto_calculado), 0);
  const total = document.querySelector('#ind-total');
  total.dataset.contar = String(cacheRegistros.length);
  animarContador(total, { duracion: 900 });
  const atendidas = document.querySelector('#ind-atendidas');
  atendidas.dataset.contar = String(cacheRegistros.filter((r) => r.estado === 'atendido').length);
  animarContador(atendidas, { duracion: 900 });
  document.querySelector('#ind-pendientes').textContent =
    formatearSoles(suma(cacheRegistros.filter((r) => r.estado_pago === 'pendiente')));
  document.querySelector('#ind-cobrado').textContent =
    formatearSoles(suma(cacheRegistros.filter((r) => r.estado_pago === 'pagado')));
}

async function recargar() {
  try {
    cacheRegistros = await listarTodos();
    pintarIndicadores();
    pintarTabla();
  } catch (err) {
    console.error(err);
    filaVacia(tabla, 9, `Error al cargar el panel: ${err.message}`);
  }
}

const recalcular = () => {
  salidaComision.textContent = formatearSoles(calcularMontoServicio({ monto_giro: inputGiro.value }));
};
inputGiro.addEventListener('input', recalcular);

function modoCrear() {
  form.reset();
  document.querySelector('#pnl-id').value = '';
  document.querySelector('#form-titulo').textContent = 'Registrar trámite presencial / telefónico';
  inputGiro.disabled = false;
  btnCancel.hidden = true;
  btnSubmit.textContent = 'Guardar';
  form.closest('.panel-form').classList.remove('editando');
  recalcular();
}

function prepararEdicion(r) {
  document.querySelector('#form-titulo').textContent = `Editando ${r.codigo_seguimiento ?? 'registro #' + r.id}`;
  document.querySelector('#pnl-id').value = r.id;
  document.querySelector('#pnl-nombre').value = r.beneficiario ?? '';
  document.querySelector('#pnl-dni').value = r.dni ?? '';
  document.querySelector('#pnl-programa').value = r.programa ?? '';
  document.querySelector('#pnl-estado').value = r.estado ?? 'registrado';
  inputGiro.value = Number(r.monto_giro ?? 0);
  inputGiro.disabled = r.estado_pago === 'pagado'; // no se cambia el giro de algo ya cobrado
  btnCancel.hidden = false;
  btnSubmit.textContent = 'Actualizar';
  const tarjeta = form.closest('.panel-form');
  tarjeta.classList.remove('editando');
  void tarjeta.offsetWidth;
  tarjeta.classList.add('editando');
  recalcular();
  tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#pnl-nombre').focus({ preventScroll: true });
}

// Delegación de eventos: un solo listener para todos los botones de la tabla
tabla.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-accion]');
  if (!b) return;
  const r = cacheRegistros.find((x) => x.id === Number(b.dataset.id));
  if (!r) return;
  if (b.dataset.accion === 'editar') return prepararEdicion(r);

  const confirmado = await confirmar(
    `¿Eliminar permanentemente la inscripción ${r.codigo_seguimiento ?? '#' + r.id} de ${r.beneficiario}?`,
    { titulo: 'Eliminar inscripción', aceptar: 'Sí, eliminar', peligro: true }
  );
  if (!confirmado) return;
  try {
    const resultado = await eliminarRegistro(r.id);
    if (!resultado.ok) {
      aviso(resultado.mensaje, 'error', 6000);
      return;
    }
    mostrarConfirmacion(zonaConfirmacion, { titulo: 'Registro eliminado', detalle: `${r.codigo_seguimiento ?? '#' + r.id} fue eliminado del sistema.` });
    await recargar();
  } catch (err) {
    aviso(`Error al eliminar: ${err.message}`, 'error');
  }
});

btnCancel.addEventListener('click', modoCrear);
filtroTexto.addEventListener('input', pintarTabla);
filtroPago.addEventListener('change', pintarTabla);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(form));
  // Un input deshabilitado no viaja en FormData: se toma su valor directamente
  datos.monto_giro = inputGiro.value;
  datos.beneficiario = (datos.beneficiario ?? '').trim();

  if (datos.beneficiario.length < 3) { error.textContent = 'Escribe el nombre del beneficiario.'; return; }
  if (!validarDNI(datos.dni)) { error.textContent = 'El DNI debe tener 8 dígitos.'; return; }
  if (!datos.programa) { error.textContent = 'Selecciona un programa.'; return; }
  error.textContent = '';

  btnSubmit.disabled = true;
  try {
    if (datos.id) {
      await actualizarCualquiera(Number(datos.id), datos);
      mostrarConfirmacion(zonaConfirmacion, { titulo: '¡Registro actualizado!', detalle: `${datos.beneficiario} · estado ${datos.estado}` });
    } else {
      const codigo = await crearRegistro(datos);
      mostrarConfirmacion(zonaConfirmacion, {
        titulo: '¡Trámite presencial registrado!',
        detalle: 'El beneficiario paga la comisión en caja con este código:',
        codigo
      });
    }
    modoCrear();
    await recargar();
  } catch (err) {
    console.error(err);
    error.textContent = `Error en la operación: ${err.message}`;
  } finally {
    btnSubmit.disabled = false;
  }
});

recalcular();
recargar();
