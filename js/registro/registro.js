// js/registro/registro.js — cotizador en vivo + INSERT con monto (Semana 9)
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { calcularMontoServicio, detalleCalculo, formatearSoles, generarCodigoSeguimiento, redondear } from './tarifario.js';
import { validarDNI } from '../pago/validaciones.js';
import { prepararCabecera, mostrarConfirmacion, inclinacion3D } from '../ui/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

const form = document.querySelector('#form-registro');
const salidaMonto = document.querySelector('#monto-estimado');
const detalle = document.querySelector('#detalle-calculo');
const error = document.querySelector('#error-registro');
const inputDni = document.querySelector('#reg-dni');
const inputGiro = document.querySelector('#reg-giro');
const leerFormulario = () => Object.fromEntries(new FormData(form));

// Si el usuario tiene DNI registrado, se sugiere en el formulario
if (usuario.dni) inputDni.value = usuario.dni;

/* ---------- Cotizador en vivo + vista previa 3D ---------- */
const pv = (id) => document.querySelector(`#pv-${id}`);

function actualizarCotizacion() {
  const datos = leerFormulario();
  const comision = calcularMontoServicio(datos);
  const giro = Number(datos.monto_giro) || 0;
  salidaMonto.textContent = formatearSoles(comision);
  salidaMonto.classList.remove('pulso');
  void salidaMonto.offsetWidth;
  salidaMonto.classList.add('pulso');
  detalle.textContent = detalleCalculo(datos);

  pv('nombre').textContent = datos.beneficiario?.trim() || '—';
  pv('programa').textContent = datos.programa || '—';
  pv('giro').textContent = formatearSoles(giro);
  pv('comision').textContent = formatearSoles(comision);
  pv('total').textContent = formatearSoles(redondear(giro + comision));
}

form.addEventListener('input', actualizarCotizacion);   // texto y números, en cada tecla
form.addEventListener('change', actualizarCotizacion);  // select
inputDni.addEventListener('input', () => { inputDni.value = inputDni.value.replace(/\D/g, '').slice(0, 8); });

document.querySelectorAll('.chip-monto').forEach((chip) => {
  chip.addEventListener('click', () => {
    inputGiro.value = chip.dataset.monto;
    actualizarCotizacion();
  });
});

actualizarCotizacion();
inclinacion3D(document.querySelector('#boleta-3d'), 10);

/* ---------- Validación en el cliente ---------- */
function validar(datos) {
  if (!datos.beneficiario || datos.beneficiario.trim().length < 3) return 'Escribe el nombre completo del beneficiario.';
  if (!validarDNI(datos.dni)) return 'El DNI debe tener exactamente 8 dígitos.';
  if (!datos.programa) return 'Selecciona el programa social.';
  const giro = Number(datos.monto_giro);
  if (Number.isNaN(giro) || giro < 0 || giro > 50000) return 'El monto del giro debe estar entre S/ 0 y S/ 50 000.';
  return '';
}

/* ---------- Envío: INSERT en Neon ---------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = leerFormulario();
  const mensajeError = validar(datos);
  error.textContent = mensajeError;
  if (mensajeError) return;

  const monto = calcularMontoServicio(datos); // se recalcula: no se confía en la pantalla
  const giro = redondear(Number(datos.monto_giro) || 0);
  const estadoPago = monto === 0 ? 'exonerado' : 'pendiente';
  const codigo = generarCodigoSeguimiento();
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const filas = await sql`
      INSERT INTO inscripciones_programas_sociales
        (codigo_seguimiento, beneficiario, dni, programa, id_usuario,
         monto_giro, monto_calculado, estado_pago, estado)
      VALUES (${codigo}, ${datos.beneficiario.trim()}, ${datos.dni}, ${datos.programa}, ${usuario.id},
              ${giro}, ${monto}, ${estadoPago}, 'registrado')
      RETURNING id, codigo_seguimiento;
    `;

    // Animación de confirmación con el código de seguimiento generado
    mostrarConfirmacion(document.querySelector('#resultado-registro'), {
      titulo: '¡Inscripción registrada!',
      detalle: estadoPago === 'pendiente'
        ? `Comisión por pagar: ${formatearSoles(monto)}. Tu código de seguimiento es:`
        : 'Tu inscripción está exonerada de comisión. Tu código de seguimiento es:',
      codigo: filas[0].codigo_seguimiento
    });
    const acciones = document.querySelector('#acciones-post');
    const enlacePagar = document.querySelector('#enlace-pagar');
    enlacePagar.hidden = estadoPago !== 'pendiente';
    enlacePagar.href = `pago.html?id=${filas[0].id}`;
    acciones.hidden = false;
    form.reset();
    if (usuario.dni) inputDni.value = usuario.dni;
    actualizarCotizacion();
    document.querySelector('#resultado-registro').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    console.error('Error al registrar:', err);
    error.textContent = 'No se pudo registrar la inscripción. Intenta nuevamente.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar inscripción';
  }
});
