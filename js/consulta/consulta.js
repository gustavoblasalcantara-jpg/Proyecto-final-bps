// js/consulta/consulta.js — mis registros + filtro por usuario + estado de pago
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { prepararCabecera, celda, etiqueta, filaVacia, animarFilas, animarContador } from '../ui/ui.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');
prepararCabecera(usuario, cerrarSesion);

const tbody = document.querySelector('#tabla-cuerpo-consulta');

// Enlace con estilo de botón (Transición 3: color y escala)
function enlaceBoton(texto, href, clase) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = texto;
  a.className = `boton boton-mini ${clase}`;
  return a;
}

// Acción que corresponde según el estado de pago
function accionDePago(td, r) {
  if (r.estado_pago === 'pendiente') {
    td.append(enlaceBoton('Pagar', `pago.html?id=${r.id}`, 'boton-oro'));
  } else if (r.estado_pago === 'pagado' && r.codigo_operacion) {
    td.append(enlaceBoton('Ver comprobante', `comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`, 'boton-exito'));
  }
}

async function cargarRegistros() {
  try {
    // RF-5.5: solo los registros del usuario en sesión (WHERE id_usuario = usuario.id)
    const registros = await sql`
      SELECT r.id, r.codigo_seguimiento, r.beneficiario, r.dni, r.programa, r.estado,
             r.estado_pago, r.monto_giro, r.monto_calculado, p.codigo_operacion
      FROM inscripciones_programas_sociales r
      LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
      WHERE r.id_usuario = ${usuario.id}
      ORDER BY r.id DESC;
    `;

    pintarResumen(registros);

    if (registros.length === 0) {
      filaVacia(tbody, 9, 'No tienes trámites registrados. Crea tu primera inscripción en "Nueva inscripción".');
      return;
    }

    tbody.replaceChildren();
    for (const r of registros) {
      const tr = document.createElement('tr');
      celda(tr, r.codigo_seguimiento).className = 'codigo';
      celda(tr, r.beneficiario || 'Sin nombre');
      celda(tr, r.dni);
      celda(tr, r.programa);
      celda(tr, formatearSoles(r.monto_giro));
      celda(tr, formatearSoles(r.monto_calculado));
      celda(tr).append(etiqueta(r.estado, r.estado));
      celda(tr).append(etiqueta(r.estado_pago, r.estado_pago));

      const tdAcciones = celda(tr);
      const caja = document.createElement('div');
      caja.className = 'celda-acciones';
      // Solo se edita si la comisión sigue pendiente y la entidad aún no atendió el trámite
      if (r.estado_pago === 'pendiente' && r.estado === 'registrado') {
        caja.append(enlaceBoton('Editar', `actualizar.html?id=${r.id}`, 'boton-secundario'));
      }
      accionDePago(caja, r);
      if (!caja.childElementCount) {
        const s = document.createElement('span');
        s.className = 'texto-suave';
        s.textContent = 'Solo lectura';
        caja.append(s);
      }
      tdAcciones.append(caja);
      tbody.append(tr);
    }
    animarFilas(tbody); // Animación 2: entrada animada de la tabla
  } catch (err) {
    console.error('Error al consultar Neon:', err);
    filaVacia(tbody, 9, `Error al cargar tus registros: ${err.message}`);
  }
}

function pintarResumen(registros) {
  const pendientes = registros.filter((r) => r.estado_pago === 'pendiente');
  const totalPendiente = pendientes.reduce((s, r) => s + Number(r.monto_calculado), 0);
  const total = document.querySelector('#res-total');
  total.dataset.contar = String(registros.length);
  animarContador(total, { duracion: 900 });
  document.querySelector('#res-pendiente').textContent = `${formatearSoles(totalPendiente)} (${pendientes.length})`;
  document.querySelector('#res-pagado').textContent = String(registros.filter((r) => r.estado_pago === 'pagado').length);
}

cargarRegistros();
