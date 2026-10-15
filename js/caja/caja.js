// js/caja/caja.js — módulo del cajero: cobro presencial, conciliación de pagos en línea y cierre del día
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles, redondear } from '../registro/tarifario.js';
import { generarCodigoOperacion } from '../pago/validaciones.js';
import {
  prepararCabecera, celda, etiqueta, filaVacia, animarFilas, mostrarConfirmacion, confirmar, aviso
} from '../ui/ui.js';

const usuario = exigirRol('cajero', 'administrador');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

/* =========================================================
   A. DATOS — consultas a Neon
   ========================================================= */

// Búsqueda con ILIKE por código, DNI o nombre (del cliente o del beneficiario)
async function buscarPendientes(criterio = '') {
  const patron = `%${criterio.trim()}%`;
  return await sql`
    SELECT r.id, r.id_usuario, r.codigo_seguimiento, r.beneficiario, r.dni AS dni_beneficiario,
           r.monto_giro, r.monto_calculado, u.nombre AS cliente, u.dni
    FROM inscripciones_programas_sociales r
    LEFT JOIN usuarios u ON u.id = r.id_usuario      -- LEFT: incluye registros creados en el panel
    WHERE r.estado_pago = 'pendiente'
      AND (r.codigo_seguimiento ILIKE ${patron} OR u.dni ILIKE ${patron} OR u.nombre ILIKE ${patron}
           OR r.dni ILIKE ${patron} OR r.beneficiario ILIKE ${patron})
    ORDER BY r.id ASC
    LIMIT 50;
  `;
}

const METODOS_CAJA = {
  efectivo: { metodo: 'efectivo', proveedor: null },
  pos: { metodo: 'pos', proveedor: null },
  andipay: { metodo: 'billetera', proveedor: 'andipay' },
  pagomovil: { metodo: 'billetera', proveedor: 'pagomovil' }
};

async function cobrarPresencial({ registro, opcion, montoRecibido, referencia }) {
  const { metodo, proveedor } = METODOS_CAJA[opcion];
  const monto = Number(registro.monto_calculado);
  let vuelto = null;
  if (metodo === 'efectivo') {
    if (!(montoRecibido >= monto)) throw new Error('El monto recibido es menor que el total.');
    vuelto = redondear(montoRecibido - monto);
    referencia = 'Efectivo';
  } else {
    montoRecibido = null;
    referencia = (metodo === 'pos' ? 'Voucher ' : 'Op. ') + referencia;
  }
  const codigo = generarCodigoOperacion('CJ');
  // Todo o nada: el pago y el cambio de estado se confirman juntos
  await sql.transaction([
    sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo, proveedor_billetera,
                           referencia, monto, monto_recibido, vuelto, estado, id_cajero)
        VALUES (${codigo}, ${registro.id}, ${registro.id_usuario}, 'caja', ${metodo}, ${proveedor},
                ${referencia}, ${monto}, ${montoRecibido}, ${vuelto}, 'aprobado', ${usuario.id});`,
    sql`UPDATE inscripciones_programas_sociales
        SET estado_pago = 'pagado', canal_pago = 'caja', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`
  ]);
  return { codigo, vuelto };
}

// Pagos de la pasarela de una fecha, en hora de Lima (aprobados y rechazados)
async function listarPagosEnLinea(fecha, soloPorVerificar) {
  return await sql`
    SELECT p.id, p.codigo_operacion, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
           p.monto, p.estado, p.motivo_rechazo, p.verificado, p.fecha_pago,
           r.codigo_seguimiento, u.nombre AS cliente, v.nombre AS verificador
    FROM pagos p
    JOIN inscripciones_programas_sociales r ON r.id = p.id_registro
    LEFT JOIN usuarios u ON u.id = p.id_usuario
    LEFT JOIN usuarios v ON v.id = p.verificado_por
    WHERE p.canal = 'pasarela'
      AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      AND (${soloPorVerificar} = false OR (p.estado = 'aprobado' AND p.verificado = false))
    ORDER BY p.fecha_pago DESC;
  `;
}

async function verificarPago(idPago) {
  await sql`
    UPDATE pagos
    SET verificado = true, verificado_por = ${usuario.id}, fecha_verificacion = NOW()
    WHERE id = ${idPago} AND canal = 'pasarela' AND estado = 'aprobado';
  `;
}

async function resumenDelDia(fecha) {
  return await sql`
    SELECT canal, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total
    FROM pagos
    WHERE estado = 'aprobado'
      AND (fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
    GROUP BY canal, metodo
    ORDER BY canal, metodo;
  `;
}

/* =========================================================
   B. INTERFAZ
   ========================================================= */
const $ = (selector) => document.querySelector(selector);
const tablaPendientes = $('#tabla-pendientes tbody');
const tablaEnLinea = $('#tabla-en-linea tbody');
const tablaResumen = $('#tabla-resumen tbody');
const dialogo = $('#dialogo-cobro');
const formCobro = $('#form-cobro');
const selectMetodo = $('#metodo-caja');
const inputRecibido = $('#monto-recibido');
const inputReferencia = $('#referencia');
const inputFecha = $('#fecha-caja');
const chkPorVerificar = $('#solo-por-verificar');
const errorCobro = $('#error-cobro');

$('#nombre-cajero').textContent = usuario.nombre;

// Fecha de HOY en Lima con formato AAAA-MM-DD (el formato que espera <input type="date">)
const hoyEnLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
inputFecha.value = hoyEnLima();

let pendientesCache = [];
let registroEnCobro = null;
let ultimoIdVisto = null;

const NOMBRES_METODO = {
  tarjeta_debito: 'Débito', tarjeta_credito: 'Crédito', billetera: 'Billetera', efectivo: 'Efectivo', pos: 'POS'
};

function boton(texto, accion, id, clase) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.className = `boton boton-mini ${clase}`;
  b.dataset.accion = accion;
  b.dataset.id = id;
  return b;
}

const NOMBRES_BILLETERA = { andipay: 'AndiPay', pagomovil: 'PagoMóvil' };

function describirMedio(p) {
  if (p.metodo === 'billetera') return `${NOMBRES_BILLETERA[p.proveedor_billetera] ?? 'Billetera'} ${p.referencia ?? ''}`.trim();
  if (p.marca_tarjeta) return `${p.marca_tarjeta} ${p.referencia ?? ''}`.trim();
  return p.referencia ?? p.metodo;
}

/* ---------- Cobro presencial ---------- */
async function pintarPendientes(criterio = '') {
  try {
    pendientesCache = await buscarPendientes(criterio);
  } catch (err) {
    console.error(err);
    filaVacia(tablaPendientes, 6, `Error al buscar: ${err.message}`);
    return;
  }
  if (pendientesCache.length === 0) return filaVacia(tablaPendientes, 6, 'Sin inscripciones pendientes para ese criterio.');
  tablaPendientes.replaceChildren();
  for (const r of pendientesCache) {
    const tr = document.createElement('tr');
    celda(tr, r.codigo_seguimiento).className = 'codigo';
    const tdCliente = celda(tr, r.cliente ?? 'Atención presencial');
    if (r.beneficiario && r.beneficiario !== r.cliente) {
      const s = document.createElement('small');
      s.className = 'sub';
      s.textContent = `Beneficiario: ${r.beneficiario}`;
      tdCliente.append(s);
    }
    celda(tr, r.dni ?? r.dni_beneficiario);
    celda(tr, formatearSoles(r.monto_giro));
    celda(tr, formatearSoles(r.monto_calculado)).className = 'monto';
    celda(tr).append(boton('Cobrar', 'cobrar', r.id, 'boton-oro'));
    tablaPendientes.append(tr);
  }
  animarFilas(tablaPendientes);
}

$('#form-buscar').addEventListener('submit', (e) => {
  e.preventDefault();
  pintarPendientes(new FormData(e.target).get('criterio'));
});

function ajustarCamposMetodo() {
  const esEfectivo = selectMetodo.value === 'efectivo';
  $('#campo-recibido').hidden = !esEfectivo;
  $('#campo-referencia').hidden = esEfectivo;
  inputRecibido.required = esEfectivo;
  inputReferencia.required = !esEfectivo;
  $('#vuelto').textContent = formatearSoles(0);
  errorCobro.textContent = '';
}
selectMetodo.addEventListener('change', ajustarCamposMetodo);

inputRecibido.addEventListener('input', () => {
  const vuelto = Number(inputRecibido.value) - Number(registroEnCobro.monto_calculado);
  $('#vuelto').textContent = vuelto >= 0 ? formatearSoles(redondear(vuelto)) : 'Monto insuficiente';
});

// Delegación de eventos: un solo listener para todos los botones "Cobrar"
tablaPendientes.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accion="cobrar"]');
  if (!b) return;
  registroEnCobro = pendientesCache.find((r) => r.id === Number(b.dataset.id));
  $('#cobro-codigo').textContent = registroEnCobro.codigo_seguimiento;
  $('#cobro-total').textContent = formatearSoles(registroEnCobro.monto_calculado);
  formCobro.reset();
  ajustarCamposMetodo();
  dialogo.showModal();
});

$('#cancelar-cobro').addEventListener('click', () => dialogo.close());

formCobro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formCobro));
  if (datos.metodo !== 'efectivo' && !/^\d{6,12}$/.test(datos.referencia ?? '')) {
    errorCobro.textContent = 'Ingresa el número de voucher u operación (6 a 12 dígitos).';
    return;
  }
  if (datos.metodo === 'efectivo' && !(Number(datos.monto_recibido) >= Number(registroEnCobro.monto_calculado))) {
    errorCobro.textContent = 'El monto recibido es menor que el total.';
    return;
  }
  const total = formatearSoles(registroEnCobro.monto_calculado);
  const ok = await confirmar(`¿Confirmar el cobro de ${total} por la solicitud ${registroEnCobro.codigo_seguimiento}?`,
    { titulo: 'Confirmar cobro', aceptar: 'Cobrar' });
  if (!ok) return;

  const botonConfirmar = formCobro.querySelector('button[type="submit"]');
  botonConfirmar.disabled = true;
  try {
    const { codigo, vuelto } = await cobrarPresencial({
      registro: registroEnCobro,
      opcion: datos.metodo,
      montoRecibido: Number(datos.monto_recibido),
      referencia: datos.referencia
    });
    dialogo.close();
    // Animación 3: confirmación al completar un pago
    mostrarConfirmacion($('#confirmacion-cobro'), {
      titulo: 'Cobro registrado',
      detalle: vuelto !== null ? `Entregar vuelto: ${formatearSoles(vuelto)}. N.° de operación:` : 'N.° de operación:',
      codigo
    });
    const enlace = document.createElement('a');
    enlace.href = `comprobante.html?op=${encodeURIComponent(codigo)}`;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.className = 'boton boton-mini boton-primario enlace-comprobante';
    enlace.textContent = 'Ver / imprimir comprobante';
    $('#confirmacion-cobro').append(enlace);
    await Promise.all([pintarPendientes($('#criterio').value), refrescar()]);
  } catch (error) {
    console.error(error);
    errorCobro.textContent = error.code === '23505'
      ? 'Esta solicitud ya fue pagada.'
      : (error.message || 'No se pudo registrar el cobro.');
  } finally {
    botonConfirmar.disabled = false;
  }
});

/* ---------- Pagos en línea (conciliación) ---------- */
async function pintarPagosEnLinea() {
  const pagos = await listarPagosEnLinea(inputFecha.value, chkPorVerificar.checked);
  tablaEnLinea.replaceChildren();
  if (pagos.length === 0) filaVacia(tablaEnLinea, 8, 'Sin operaciones en línea para esta fecha.');
  for (const p of pagos) {
    const tr = document.createElement('tr');
    if (p.estado === 'rechazado') tr.className = 'fila-rechazada';
    celda(tr, new Date(p.fecha_pago).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }));
    celda(tr, p.codigo_operacion).className = 'codigo';
    celda(tr, p.codigo_seguimiento);
    celda(tr, p.cliente);
    celda(tr, describirMedio(p));
    celda(tr, formatearSoles(p.monto));
    const tdRes = celda(tr);
    tdRes.append(etiqueta(p.estado === 'aprobado' ? 'Aprobado' : 'Rechazado', p.estado));
    if (p.estado === 'rechazado' && p.motivo_rechazo) {
      const s = document.createElement('small');
      s.className = 'sub';
      s.textContent = p.motivo_rechazo;
      tdRes.append(s);
    }
    const tdAccion = celda(tr);
    if (p.estado === 'aprobado' && !p.verificado) tdAccion.append(boton('Verificar', 'verificar', p.id, 'boton-exito'));
    else if (p.verificado) tdAccion.textContent = `Verificado por ${p.verificador}`;
    tablaEnLinea.append(tr);
  }
  if (pagos.length) animarFilas(tablaEnLinea);

  // Aviso de pagos nuevos desde la última revisión
  const idsAprobados = pagos.filter((p) => p.estado === 'aprobado').map((p) => p.id);
  const maxId = idsAprobados.length ? Math.max(...idsAprobados) : 0;
  if (ultimoIdVisto !== null && maxId > ultimoIdVisto) {
    const nuevos = idsAprobados.filter((id) => id > ultimoIdVisto).length;
    $('#aviso-nuevos').textContent = `Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`;
    aviso(`Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`, 'exito');
  }
  ultimoIdVisto = Math.max(ultimoIdVisto ?? 0, maxId);
}

tablaEnLinea.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion="verificar"]');
  if (!b) return;
  const ok = await confirmar('¿Confirmas que este pago figura en el estado de cuenta de la entidad?',
    { titulo: 'Verificar pago en línea', aceptar: 'Verificar' });
  if (!ok) return;
  try {
    await verificarPago(Number(b.dataset.id));
    aviso('Pago verificado. El giro puede liberarse.', 'exito');
    await pintarPagosEnLinea();
  } catch (err) {
    aviso(`No se pudo verificar: ${err.message}`, 'error');
  }
});

/* ---------- Resumen del día ---------- */
async function pintarResumen() {
  const filas = await resumenDelDia(inputFecha.value);
  tablaResumen.replaceChildren();
  let total = 0;
  if (filas.length === 0) filaVacia(tablaResumen, 4, 'Sin cobros aprobados en esta fecha.');
  for (const f of filas) {
    const tr = document.createElement('tr');
    celda(tr, f.canal === 'pasarela' ? 'En línea' : 'Ventanilla');
    celda(tr, NOMBRES_METODO[f.metodo] ?? f.metodo);
    celda(tr, String(f.operaciones));
    celda(tr, formatearSoles(f.total));
    tablaResumen.append(tr);
    total += Number(f.total);
  }
  if (filas.length) animarFilas(tablaResumen);
  $('#total-dia').textContent = formatearSoles(redondear(total));
}

async function refrescar() {
  try {
    await Promise.all([pintarPagosEnLinea(), pintarResumen()]);
  } catch (error) {
    console.error(error);
  }
}

inputFecha.addEventListener('change', () => { ultimoIdVisto = null; $('#aviso-nuevos').textContent = ''; refrescar(); });
chkPorVerificar.addEventListener('change', refrescar);

// Revisa cada 15 segundos si entraron pagos por la pasarela (solo con la pestaña visible)
setInterval(() => { if (!document.hidden) refrescar(); }, 15000);

pintarPendientes();
refrescar();
