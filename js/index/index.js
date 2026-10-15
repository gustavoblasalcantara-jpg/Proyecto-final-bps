// js/index/index.js — script propio de index.html
import { usuarioActual, cerrarSesion, rutaInicioSegunRol } from '../auth/auth.js';
import {
  prepararCabecera, revelarAlScroll, inclinacion3D, animarContador, mostrarConfirmacion
} from '../ui/ui.js';
import { calcularFechaPago, formatearFechaLarga } from './fecha-pago.js';

/* 1. Cabecera según la sesión: si hay usuario, mostrar su nombre y "Cerrar sesión" */
const usuario = usuarioActual();
const enlaceAcceso = document.querySelector('#enlace-acceso');
if (usuario) {
  enlaceAcceso.textContent = 'Mi espacio';
  enlaceAcceso.href = rutaInicioSegunRol(usuario.rol);
  document.querySelector('#usuario-chip').closest('li').hidden = false;
  document.querySelector('#btn-logout').closest('li').hidden = false;
}
prepararCabecera(usuario, cerrarSesion);

/* 2. Escena 3D del hero: la moneda recibe su canto (capas apiladas en Z)
      y toda la escena se inclina siguiendo al puntero */
const moneda = document.querySelector('#moneda-3d');
for (let i = 0; i < 10; i++) {
  const capa = document.createElement('span');
  capa.className = 'moneda-canto';
  capa.style.setProperty('--z', `${(i - 4.5) * 1.1}px`);
  moneda.append(capa);
}
inclinacion3D(document.querySelector('#escena-3d'), 14);

/* 3. Animaciones al hacer scroll + contador de cifras */
revelarAlScroll('[data-revelar]');
revelarAlScroll('.hero-cifras', (el) => {
  el.querySelectorAll('[data-contar]').forEach((dd) =>
    animarContador(dd, { prefijo: dd.dataset.prefijo ?? '' }));
});
// Animación asignada n.º 1: conteo / aparición progresiva de la sección de agencias
revelarAlScroll('#agencias', (seccion) => {
  seccion.querySelectorAll('[data-contar]').forEach((el, i) =>
    animarContador(el, { duracion: 1400 + i * 150 }));
});

/* 4. RF-5.2: consulta simulada de fecha de pago por DNI */
const form = document.querySelector('#form-fecha-pago');
const inputDni = document.querySelector('#fp-dni');
const error = document.querySelector('#fp-error');
const zonaConfirmacion = document.querySelector('#fp-confirmacion');
const resultado = document.querySelector('#fp-resultado');

inputDni.addEventListener('input', () => {
  inputDni.value = inputDni.value.replace(/\D/g, '').slice(0, 8);
  error.textContent = '';
  inputDni.removeAttribute('aria-invalid');
});

function agregarDato(lista, termino, valor) {
  const contenedor = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = termino;
  dd.textContent = valor;
  contenedor.append(dt, dd);
  lista.append(contenedor);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(form));
  const consulta = calcularFechaPago(datos.dni, datos.tipo);
  if (!consulta) {
    error.textContent = 'El DNI debe tener exactamente 8 dígitos.';
    inputDni.setAttribute('aria-invalid', 'true');
    inputDni.focus();
    resultado.hidden = true;
    zonaConfirmacion.hidden = true;
    return;
  }

  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Consultando…';
  setTimeout(() => {           // pequeña espera para simular la consulta
    boton.disabled = false;
    boton.textContent = 'Consultar fecha de pago';

    mostrarConfirmacion(zonaConfirmacion, {
      titulo: 'Consulta realizada',
      detalle: `${consulta.concepto} · DNI terminado en ${consulta.ultimoDigito}`
    });

    resultado.replaceChildren();
    agregarDato(resultado, 'Fecha de pago', formatearFechaLarga(consulta.fecha));
    agregarDato(resultado, 'Faltan', consulta.dias === 0 ? '¡Es hoy!' : `${consulta.dias} día(s)`);
    agregarDato(resultado, 'Horario sugerido', consulta.horario);
    agregarDato(resultado, 'Dónde cobrar', consulta.canal);
    resultado.hidden = false;
    resultado.classList.remove('bloque-resultado--visible');
    void resultado.offsetWidth;
    resultado.classList.add('bloque-resultado--visible');
  }, 650);
});
