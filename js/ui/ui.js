// js/ui/ui.js — utilidades de interfaz compartidas por todas las páginas
// (mensajes, confirmación animada, modal de confirmación, efectos 3D y animación al hacer scroll).
// Todo el contenido dinámico se escribe con textContent: nunca se interpreta un dato como HTML.

const reducirMovimiento = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------
   1. Cabecera: nombre del usuario, rol y botón de cerrar sesión
   --------------------------------------------------------------- */
export function prepararCabecera(usuario, cerrarSesion) {
  const chip = document.querySelector('#usuario-chip');
  if (chip && usuario) {
    const ROLES = { cliente: 'Cliente', administrador: 'Administrador', empleado: 'Empleado', cajero: 'Cajero' };
    chip.textContent = `${usuario.nombre} · ${ROLES[usuario.rol] ?? usuario.rol}`;
    chip.dataset.rol = usuario.rol;
    chip.hidden = false;
  }
  document.querySelector('#btn-logout')?.addEventListener('click', cerrarSesion);
  // Enlaces que solo ve un rol concreto: <a data-solo-rol="administrador">
  document.querySelectorAll('[data-solo-rol]').forEach((el) => {
    const roles = el.dataset.soloRol.split(' ');
    const li = el.closest('li') ?? el;
    li.hidden = !usuario || !roles.includes(usuario.rol);
  });
}

/* ---------------------------------------------------------------
   2. Aviso flotante (toast) — reemplaza a alert() en las operaciones
   --------------------------------------------------------------- */
function contenedorAvisos() {
  let zona = document.querySelector('.zona-avisos');
  if (!zona) {
    zona = document.createElement('div');
    zona.className = 'zona-avisos';
    zona.setAttribute('role', 'status');
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
  return zona;
}

export function aviso(texto, tipo = 'info', duracion = 4200) {
  const item = document.createElement('p');
  item.className = `aviso aviso--${tipo}`;
  item.textContent = texto;
  contenedorAvisos().append(item);
  setTimeout(() => {
    item.classList.add('aviso--saliendo');
    item.addEventListener('animationend', () => item.remove(), { once: true });
    setTimeout(() => item.remove(), 800);
  }, duracion);
}

/* ---------------------------------------------------------------
   3. Confirmación animada (animación CSS asignada n.º 3)
   Se dispara al consultar por DNI, generar un código de seguimiento
   o completar un pago.
   --------------------------------------------------------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';

function iconoCheck(tipo) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 52 52');
  svg.setAttribute('class', 'check-animado');
  svg.setAttribute('aria-hidden', 'true');
  const circulo = document.createElementNS(SVG_NS, 'circle');
  circulo.setAttribute('cx', '26');
  circulo.setAttribute('cy', '26');
  circulo.setAttribute('r', '23');
  circulo.setAttribute('class', 'check-circulo');
  const trazo = document.createElementNS(SVG_NS, 'path');
  trazo.setAttribute('class', 'check-trazo');
  trazo.setAttribute('d', tipo === 'error' ? 'M17 17 L35 35 M35 17 L17 35' : 'M14 27 L22 35 L38 18');
  svg.append(circulo, trazo);
  return svg;
}

export function mostrarConfirmacion(contenedor, { titulo, detalle = '', codigo = '', tipo = 'exito' }) {
  contenedor.replaceChildren();
  contenedor.hidden = false;
  const caja = document.createElement('div');
  caja.className = `confirmacion confirmacion--${tipo}`;
  const texto = document.createElement('div');
  const h = document.createElement('p');
  h.className = 'confirmacion-titulo';
  h.textContent = titulo;
  texto.append(h);
  if (detalle) {
    const p = document.createElement('p');
    p.className = 'confirmacion-detalle';
    p.textContent = detalle;
    texto.append(p);
  }
  if (codigo) {
    const c = document.createElement('p');
    c.className = 'confirmacion-codigo';
    c.textContent = codigo;
    texto.append(c);
  }
  caja.append(iconoCheck(tipo), texto);
  contenedor.append(caja);
  // reinicia la animación aunque el contenedor ya se haya mostrado antes
  void caja.offsetWidth;
  caja.classList.add('confirmacion--activa');
  if (tipo === 'exito') lanzarMonedas(caja);
  return caja;
}

// Pequeña lluvia de monedas 3D sobre la confirmación (decorativa)
function lanzarMonedas(caja) {
  if (reducirMovimiento()) return;
  const capa = document.createElement('div');
  capa.className = 'lluvia-monedas';
  capa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const m = document.createElement('span');
    m.className = 'moneda-confeti';
    m.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
    m.style.setProperty('--d', `${Math.round(Math.random() * 500)}ms`);
    m.style.setProperty('--g', `${Math.round(Math.random() * 720 - 360)}deg`);
    capa.append(m);
  }
  caja.append(capa);
  setTimeout(() => capa.remove(), 2600);
}

/* ---------------------------------------------------------------
   4. Modal de confirmación con <dialog> (reemplaza a confirm())
   --------------------------------------------------------------- */
export function confirmar(mensaje, { titulo = 'Confirmar', aceptar = 'Aceptar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo-confirmar';
    const form = document.createElement('form');
    form.method = 'dialog';
    const h = document.createElement('h2');
    h.textContent = titulo;
    const p = document.createElement('p');
    p.textContent = mensaje;
    const acciones = document.createElement('div');
    acciones.className = 'dialogo-acciones';
    const no = document.createElement('button');
    no.type = 'submit';
    no.value = 'no';
    no.className = 'boton boton-secundario';
    no.textContent = 'Cancelar';
    const si = document.createElement('button');
    si.type = 'submit';
    si.value = 'si';
    si.className = `boton ${peligro ? 'boton-peligro' : 'boton-primario'}`;
    si.textContent = aceptar;
    acciones.append(no, si);
    form.append(h, p, acciones);
    dialogo.append(form);
    document.body.append(dialogo);
    dialogo.addEventListener('close', () => {
      resolver(dialogo.returnValue === 'si');
      dialogo.remove();
    });
    dialogo.showModal();
    si.focus();
  });
}

/* ---------------------------------------------------------------
   5. Entrada animada de filas de tabla (animación CSS asignada n.º 2)
   Cada fila recibe un índice para escalonar su @keyframes.
   --------------------------------------------------------------- */
export function animarFilas(tbody) {
  [...tbody.rows].forEach((fila, i) => {
    fila.classList.remove('fila-entrando');
    fila.style.setProperty('--i', String(Math.min(i, 20)));
    void fila.offsetWidth;
    fila.classList.add('fila-entrando');
  });
}

/* ---------------------------------------------------------------
   6. Aparición al hacer scroll (IntersectionObserver)
   --------------------------------------------------------------- */
export function revelarAlScroll(selector = '[data-revelar]', alAparecer) {
  const elementos = document.querySelectorAll(selector);
  if (!('IntersectionObserver' in window)) {
    elementos.forEach((el) => { el.classList.add('visible'); alAparecer?.(el); });
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('visible');
      alAparecer?.(entrada.target);
      observador.unobserve(entrada.target);
    });
  }, { threshold: 0.18 });
  elementos.forEach((el) => observador.observe(el));
}

/* ---------------------------------------------------------------
   7. Inclinación 3D que sigue al puntero (tarjetas y escenas)
   Solo escribe variables CSS (--rx, --ry, --brillo-x, --brillo-y);
   la transformación 3D la hace el CSS.
   --------------------------------------------------------------- */
export function inclinacion3D(elemento, intensidad = 12) {
  if (!elemento || reducirMovimiento()) return;
  const mover = (e) => {
    const r = elemento.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    elemento.style.setProperty('--ry', `${((px - 0.5) * intensidad * 2).toFixed(2)}deg`);
    elemento.style.setProperty('--rx', `${((0.5 - py) * intensidad * 2).toFixed(2)}deg`);
    elemento.style.setProperty('--brillo-x', `${(px * 100).toFixed(1)}%`);
    elemento.style.setProperty('--brillo-y', `${(py * 100).toFixed(1)}%`);
  };
  const salir = () => {
    elemento.style.setProperty('--rx', '0deg');
    elemento.style.setProperty('--ry', '0deg');
  };
  elemento.addEventListener('pointermove', mover);
  elemento.addEventListener('pointerleave', salir);
}

/* ---------------------------------------------------------------
   8. Contador animado de cifras (sección de agencias)
   --------------------------------------------------------------- */
export function animarContador(elemento, { duracion = 1600, prefijo = '', sufijo = '' } = {}) {
  const objetivo = Number(elemento.dataset.contar);
  const formato = new Intl.NumberFormat('es-PE');
  if (reducirMovimiento()) {
    elemento.textContent = prefijo + formato.format(objetivo) + sufijo;
    return;
  }
  const inicio = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - t, 3); // easeOutCubic
    elemento.textContent = prefijo + formato.format(Math.round(objetivo * suave)) + sufijo;
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* ---------------------------------------------------------------
   9. Helpers para construir tablas sin innerHTML
   --------------------------------------------------------------- */
export function celda(fila, texto = '') {
  const td = document.createElement('td');
  td.textContent = texto ?? '—';
  fila.append(td);
  return td;
}

export function etiqueta(texto, clase) {
  const span = document.createElement('span');
  span.className = `etiqueta etiqueta--${clase}`;
  span.textContent = texto;
  return span;
}

export function filaVacia(tbody, columnas, texto) {
  const tr = document.createElement('tr');
  const td = celda(tr, texto);
  td.colSpan = columnas;
  td.className = 'celda-vacia';
  tbody.replaceChildren(tr);
}
