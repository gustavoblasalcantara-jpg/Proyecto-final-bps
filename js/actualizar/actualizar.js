// js/actualizar/actualizar.js — edición solo si estado_pago = 'pendiente'
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { calcularMontoServicio, formatearSoles, redondear } from '../registro/tarifario.js';
import { validarDNI } from '../pago/validaciones.js';
import { prepararCabecera, mostrarConfirmacion, aviso } from '../ui/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

const idRegistro = Number(new URLSearchParams(window.location.search).get('id'));
const form = document.querySelector('#form-actualizar');
const msg = document.querySelector('#mensaje-estado');
const btnGuardar = document.querySelector('#btn-guardar');
const salida = document.querySelector('#monto-estimado');
const error = document.querySelector('#error-actualizar');
const campos = ['#act-nombre', '#act-dni', '#act-programa', '#act-giro'].map((s) => document.querySelector(s));

const leer = () => Object.fromEntries(new FormData(form));
const recalcular = () => { salida.textContent = formatearSoles(calcularMontoServicio(leer())); };
form.addEventListener('input', recalcular);
form.addEventListener('change', recalcular);

function estado(texto, tipo) {
  msg.textContent = texto;
  msg.className = `estado-registro estado-registro--${tipo}`;
}

async function cargarDatos() {
  if (!idRegistro) {
    window.location.href = 'consulta.html';
    return;
  }
  try {
    // AND id_usuario = ... impide abrir el registro de otro cliente cambiando el id en la URL
    const res = await sql`
      SELECT id, codigo_seguimiento, beneficiario, dni, programa, estado, estado_pago, monto_giro
      FROM inscripciones_programas_sociales
      WHERE id = ${idRegistro} AND id_usuario = ${usuario.id};
    `;
    if (res.length === 0) {
      aviso('No tienes permiso para editar este registro o no existe.', 'error');
      setTimeout(() => { window.location.href = 'consulta.html'; }, 1500);
      return;
    }
    const reg = res[0];
    document.querySelector('#titulo-codigo').textContent = reg.codigo_seguimiento ?? '';
    document.querySelector('#act-id').value = reg.id;
    document.querySelector('#act-nombre').value = reg.beneficiario ?? '';
    document.querySelector('#act-dni').value = reg.dni ?? '';
    document.querySelector('#act-programa').value = reg.programa;
    document.querySelector('#act-giro').value = Number(reg.monto_giro ?? 0);
    recalcular();

    // Regla de negocio: solo se edita si la comisión sigue pendiente y el trámite no fue atendido
    if (reg.estado_pago !== 'pendiente' || reg.estado !== 'registrado') {
      const motivo = reg.estado_pago === 'pagado'
        ? 'la comisión ya fue pagada'
        : reg.estado_pago === 'exonerado' ? 'la inscripción está exonerada' : `el trámite está en estado "${reg.estado}"`;
      estado(`Solo lectura: no se puede modificar porque ${motivo}.`, 'bloqueado');
      campos.forEach((c) => { c.disabled = true; });
      btnGuardar.disabled = true;
    } else {
      estado('Estado de pago: pendiente — modificación permitida.', 'editable');
    }
  } catch (err) {
    console.error(err);
    estado(`Error al cargar los datos: ${err.message}`, 'bloqueado');
  }
}

export async function actualizarRegistro(id, datos) {
  const monto = calcularMontoServicio(datos);
  const filas = await sql`
    UPDATE inscripciones_programas_sociales
    SET beneficiario = ${datos.beneficiario.trim()}, dni = ${datos.dni}, programa = ${datos.programa},
        monto_giro = ${redondear(Number(datos.monto_giro) || 0)},
        monto_calculado = ${monto},
        estado_pago = ${monto === 0 ? 'exonerado' : 'pendiente'}
    WHERE id = ${id} AND id_usuario = ${usuario.id}
      AND estado = 'registrado' AND estado_pago = 'pendiente'
    RETURNING id;
  `;
  return filas.length === 1; // false: no existe, no es tuyo o ya no está pendiente
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = leer();
  if (!datos.beneficiario || datos.beneficiario.trim().length < 3) { error.textContent = 'Escribe el nombre completo.'; return; }
  if (!validarDNI(datos.dni)) { error.textContent = 'El DNI debe tener 8 dígitos.'; return; }
  const giro = Number(datos.monto_giro);
  if (Number.isNaN(giro) || giro < 0 || giro > 50000) { error.textContent = 'El giro debe estar entre S/ 0 y S/ 50 000.'; return; }
  error.textContent = '';

  btnGuardar.disabled = true;
  try {
    const ok = await actualizarRegistro(Number(datos.id), datos);
    if (!ok) {
      mostrarConfirmacion(document.querySelector('#resultado-actualizar'), {
        titulo: 'No se guardaron los cambios', detalle: 'El registro ya no está pendiente de pago.', tipo: 'error'
      });
      return;
    }
    mostrarConfirmacion(document.querySelector('#resultado-actualizar'), {
      titulo: '¡Registro actualizado!',
      detalle: `Nueva comisión: ${salida.textContent}. Volviendo a tus registros…`
    });
    setTimeout(() => { window.location.href = 'consulta.html'; }, 1800);
  } catch (err) {
    console.error('Error al actualizar:', err);
    error.textContent = `Error al actualizar: ${err.message}`;
  } finally {
    btnGuardar.disabled = false;
  }
});

cargarDatos();
