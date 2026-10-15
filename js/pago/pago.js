// js/pago/pago.js — script propio de pago.html (pasarela del cliente)
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import {
  formatearNumeroTarjeta, formatearVencimiento, detectarMarca, validarFormularioTarjeta,
  validarCelular, validarCodigoAprobacion, soloDigitos
} from './validaciones.js';
import { obtenerRegistro, listarPendientesCliente, pagarConTarjeta, pagarConBilletera } from './pasarela.js';
import { prepararCabecera, mostrarConfirmacion, inclinacion3D } from '../ui/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

const $ = (s) => document.querySelector(s);
const selectRegistro = $('#registro');
const resumenMonto = $('#resumen-monto');
const resumenDetalle = $('#resumen-detalle');
const mensaje = $('#mensaje-pago');
const formTarjeta = $('#form-tarjeta');
const formBilletera = $('#form-billetera');
const inputNumero = $('#numero');
const inputVenc = $('#vencimiento');
const inputCvv = $('#cvv');
const inputTitular = $('#titular');
const marcaDetectada = $('#marca-detectada');
const tarjetaViva = $('#tarjeta-viva');
const zonaConfirmacion = $('#confirmacion-pago');

let registroActual = null;

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = `mensaje mensaje--${tipo}`;
}

function mostrarError(campo, texto = '') {
  $(`#error-${campo}`).textContent = texto ?? '';
  $(`#${campo}`).setAttribute('aria-invalid', texto ? 'true' : 'false');
}

/* ---------- 1. Cargar las inscripciones pendientes del cliente ---------- */
async function cargarPendientes() {
  try {
    const pendientes = await listarPendientesCliente(usuario.id);
    selectRegistro.replaceChildren();
    if (pendientes.length === 0) {
      mostrarMensaje('No tienes comisiones pendientes de pago.', 'info');
      formTarjeta.hidden = true;
      formBilletera.hidden = true;
      $('.selector-metodo').disabled = true;
      selectRegistro.disabled = true;
      return;
    }
    for (const p of pendientes) {
      const opcion = document.createElement('option');
      opcion.value = p.id;
      opcion.textContent = `${p.codigo_seguimiento} — ${formatearSoles(p.monto_calculado)}`;
      selectRegistro.append(opcion);
    }
    // Si llegó desde registro.html o consulta.html con ?id=, preseleccionarlo
    const idUrl = new URLSearchParams(location.search).get('id');
    if (idUrl && pendientes.some((p) => String(p.id) === idUrl)) selectRegistro.value = idUrl;
    await seleccionarRegistro();
  } catch (err) {
    console.error(err);
    mostrarMensaje('No se pudieron cargar tus inscripciones pendientes.', 'error');
  }
}

async function seleccionarRegistro() {
  registroActual = await obtenerRegistro(Number(selectRegistro.value), usuario.id);
  resumenMonto.textContent = registroActual ? formatearSoles(registroActual.monto_calculado) : '—';
  resumenDetalle.textContent = registroActual
    ? `${registroActual.programa} · giro de ${formatearSoles(registroActual.monto_giro)}`
    : '';
}

/* ---------- 2. Alternar entre tarjeta y billetera ---------- */
function mostrarMetodo() {
  if (selectRegistro.disabled) return;
  const metodo = document.querySelector('input[name="metodo"]:checked').value;
  formTarjeta.hidden = metodo !== 'tarjeta';
  formBilletera.hidden = metodo !== 'billetera';
  $('#escena-tarjeta').classList.toggle('escena-apagada', metodo !== 'tarjeta');
}

/* ---------- 3. Formato en vivo + tarjeta 3D que refleja lo que se escribe ---------- */
function pintarTarjeta() {
  const digitos = soloDigitos(inputNumero.value);
  const marca = detectarMarca(digitos);
  const relleno = (digitos + '•'.repeat(Math.max(0, 16 - digitos.length))).slice(0, Math.max(16, digitos.length));
  $('#tv-numero').textContent = relleno.replace(/(.{4})(?=.)/g, '$1 ');
  $('#tv-marca').textContent = marca ?? 'BPS';
  $('#tv-titular').textContent = inputTitular.value.trim().toUpperCase() || 'NOMBRE APELLIDO';
  $('#tv-venc').textContent = inputVenc.value || 'MM/AA';
  $('#tv-cvv').textContent = '•'.repeat(inputCvv.value.length) || '•••';
  tarjetaViva.dataset.marca = marca ?? '';
}

inputNumero.addEventListener('input', () => {
  inputNumero.value = formatearNumeroTarjeta(inputNumero.value);
  marcaDetectada.textContent = detectarMarca(inputNumero.value) ?? '';
  pintarTarjeta();
});
inputVenc.addEventListener('input', () => {
  inputVenc.value = formatearVencimiento(inputVenc.value);
  pintarTarjeta();
});
inputCvv.addEventListener('input', () => {
  inputCvv.value = soloDigitos(inputCvv.value).slice(0, 4);
  pintarTarjeta();
});
inputTitular.addEventListener('input', pintarTarjeta);
// Al corregir un campo se limpia su mensaje de error
['numero', 'vencimiento', 'cvv', 'titular', 'celular', 'codigo'].forEach((campo) => {
  $(`#${campo}`).addEventListener('input', () => mostrarError(campo, ''));
});
// Al escribir el CVV la tarjeta gira 180° para mostrar el reverso
inputCvv.addEventListener('focus', () => tarjetaViva.classList.add('girada'));
inputCvv.addEventListener('blur', () => tarjetaViva.classList.remove('girada'));
inclinacion3D($('#escena-tarjeta'), 12);

/* ---------- 4. Procesar un pago (común a tarjeta y billetera) ---------- */
async function procesar(formulario, operacion) {
  if (!registroActual || registroActual.estado_pago !== 'pendiente') {
    mostrarMensaje('Selecciona una inscripción pendiente de pago.', 'error');
    return;
  }
  const boton = formulario.querySelector('button[type="submit"]');
  const textoOriginal = boton.textContent;
  boton.disabled = true; // evita el doble clic = doble cobro
  boton.textContent = 'Procesando…';
  boton.classList.add('procesando');
  mostrarMensaje('Conectando con la entidad emisora…', 'info');
  zonaConfirmacion.hidden = true;
  try {
    const resultado = await operacion();
    if (resultado.aprobado) {
      registroActual.estado_pago = 'pagado'; // evita un segundo intento sobre la misma inscripción
      formulario.reset();
      marcaDetectada.textContent = '';
      pintarTarjeta();
      mostrarMensaje('', 'info');
      // Animación 3: confirmación al completar un pago
      mostrarConfirmacion(zonaConfirmacion, {
        titulo: '¡Pago aprobado!',
        detalle: 'Tu giro quedó habilitado. Generando tu comprobante… N.° de operación:',
        codigo: resultado.codigo
      });
      setTimeout(() => {
        window.location.href = `comprobante.html?op=${encodeURIComponent(resultado.codigo)}`;
      }, 2400);
    } else {
      mostrarConfirmacion(zonaConfirmacion, {
        titulo: 'Pago rechazado',
        detalle: resultado.motivo,
        tipo: 'error'
      });
      mostrarMensaje('', 'info');
    }
  } catch (err) {
    console.error(err);
    mostrarMensaje('No se pudo procesar el pago. Revisa tu conexión.', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
    boton.classList.remove('procesando');
  }
}

formTarjeta.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formTarjeta));
  const { valido, errores, marca, venc } = validarFormularioTarjeta(datos);
  ['numero', 'vencimiento', 'cvv', 'titular'].forEach((campo) => mostrarError(campo, errores[campo]));
  if (!valido) {
    formTarjeta.classList.remove('sacudir');
    void formTarjeta.offsetWidth;
    formTarjeta.classList.add('sacudir');
    return; // lo bloquea JavaScript: no llega a Neon
  }
  await procesar(formTarjeta, () => pagarConTarjeta({
    registro: registroActual, usuario, numero: datos.numero,
    mes: venc.mes, anio: venc.anio, cvv: datos.cvv, marca
  }));
});

formBilletera.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formBilletera));
  const celularOk = validarCelular(datos.celular);
  const codigoOk = validarCodigoAprobacion(datos.codigo);
  mostrarError('celular', celularOk ? '' : 'Celular de 9 dígitos que empiece con 9.');
  mostrarError('codigo', codigoOk ? '' : 'El código tiene 6 dígitos.');
  if (!celularOk || !codigoOk) return;
  await procesar(formBilletera, () => pagarConBilletera({
    registro: registroActual, usuario, proveedor: datos.proveedor,
    celular: datos.celular, codigoAprobacion: datos.codigo
  }));
});

document.querySelectorAll('input[name="metodo"]').forEach((r) => r.addEventListener('change', mostrarMetodo));
selectRegistro.addEventListener('change', seleccionarRegistro);
mostrarMetodo();
pintarTarjeta();
cargarPendientes();
