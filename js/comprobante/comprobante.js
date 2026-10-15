// js/comprobante/comprobante.js — constancia de pago imprimible
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion, rutaInicioSegunRol } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { prepararCabecera } from '../ui/ui.js';

const usuario = exigirSesion();
if (!usuario) throw new Error('Sin sesión');
prepararCabecera(usuario, cerrarSesion);

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica',
  efectivo: 'Efectivo',
  pos: 'Tarjeta en POS'
};
const NOMBRES_BILLETERA = { andipay: 'AndiPay', pagomovil: 'PagoMóvil' };

const contenedor = document.querySelector('#comprobante');
const papel = document.querySelector('#papel');
const volver = document.querySelector('#volver');
volver.href = usuario.rol === 'cliente' ? 'consulta.html' : rutaInicioSegunRol(usuario.rol);

function agregarDato(lista, etiqueta, valor, clase = '') {
  const fila = document.createElement('div');
  if (clase) fila.className = clase;
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = etiqueta;
  dd.textContent = valor ?? '—';
  fila.append(dt, dd);
  lista.append(fila);
}

async function cargar() {
  const op = new URLSearchParams(location.search).get('op');
  try {
    const filas = await sql`
      SELECT p.codigo_operacion, p.canal, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
             p.monto, p.monto_recibido, p.vuelto, p.fecha_pago, p.id_usuario,
             r.codigo_seguimiento, r.beneficiario, r.dni, r.programa, r.monto_giro,
             u.nombre AS cliente, c.nombre AS cajero
      FROM pagos p
      JOIN inscripciones_programas_sociales r ON r.id = p.id_registro
      LEFT JOIN usuarios u ON u.id = p.id_usuario
      LEFT JOIN usuarios c ON c.id = p.id_cajero
      WHERE p.codigo_operacion = ${op} AND p.estado = 'aprobado';
    `;
    const pago = filas[0];

    // Un cliente solo puede ver sus propios comprobantes
    if (!pago || (usuario.rol === 'cliente' && Number(pago.id_usuario) !== Number(usuario.id))) {
      contenedor.textContent = 'Comprobante no encontrado.';
      papel.classList.add('sin-datos');
      return;
    }

    const dl = document.createElement('dl');
    dl.className = 'comprobante-datos';
    agregarDato(dl, 'N.° de operación', pago.codigo_operacion, 'destacado');
    agregarDato(dl, 'Código de seguimiento', pago.codigo_seguimiento);
    agregarDato(dl, 'Beneficiario', `${pago.beneficiario ?? '—'} (DNI ${pago.dni ?? '—'})`);
    agregarDato(dl, 'Programa', pago.programa);
    agregarDato(dl, 'Cliente', pago.cliente ?? 'Atención presencial');
    agregarDato(dl, 'Canal', pago.canal === 'pasarela' ? 'Pago en línea' : 'Ventanilla');
    const extra = pago.marca_tarjeta ?? NOMBRES_BILLETERA[pago.proveedor_billetera] ?? '';
    agregarDato(dl, 'Medio', `${NOMBRES_METODO[pago.metodo] ?? pago.metodo} ${extra} ${pago.referencia ?? ''}`.replace(/\s+/g, ' ').trim());
    agregarDato(dl, 'Monto del giro', formatearSoles(pago.monto_giro));
    if (pago.metodo === 'efectivo') {
      agregarDato(dl, 'Recibido', formatearSoles(pago.monto_recibido));
      agregarDato(dl, 'Vuelto', formatearSoles(pago.vuelto));
    }
    if (pago.cajero) agregarDato(dl, 'Atendido por', pago.cajero);
    agregarDato(dl, 'Fecha y hora', new Date(pago.fecha_pago).toLocaleString('es-PE', { timeZone: 'America/Lima' }));
    agregarDato(dl, 'Comisión pagada', formatearSoles(pago.monto), 'total');

    contenedor.replaceChildren(dl);
    papel.classList.add('listo'); // dispara la animación de confirmación del sello
  } catch (err) {
    console.error(err);
    contenedor.textContent = `No se pudo cargar el comprobante: ${err.message}`;
  }
}

document.querySelector('#imprimir').addEventListener('click', () => window.print());
cargar();
