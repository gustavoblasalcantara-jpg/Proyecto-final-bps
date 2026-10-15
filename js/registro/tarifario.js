// js/registro/tarifario.js — regla de negocio del caso (funciones PURAS)
// No tocan el DOM ni la base de datos: se pueden probar en la consola del navegador.
//
// Caso 5 — Banco Perú Solidario (banca estatal)
// Qué se cobra: comisión de giro nacional · El pago habilita: la emisión del giro.
// Regla: 1.5 % del monto del giro, con comisión mínima de S/ 5.00.
// Prueba: giro S/ 200 → S/ 5.00 (mínimo) · giro S/ 1 000 → S/ 15.00 · giro S/ 0 → S/ 0.00 (exonerado)

export const TASA_COMISION = 0.015;
export const COMISION_MINIMA = 5.00;

export function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

export function formatearSoles(monto) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(monto) || 0);
}

// Un checkbox marcado llega en FormData como 'on'; si no está marcado, NO llega
export const marcado = (valor) => valor === 'on';

export function calcularMontoServicio(d) {
  const giro = Number(d.monto_giro) || 0;
  if (giro <= 0) return 0;
  return redondear(Math.max(COMISION_MINIMA, giro * TASA_COMISION));
}

// Explica el cálculo en texto (se muestra debajo del cotizador)
export function detalleCalculo(d) {
  const giro = Number(d.monto_giro) || 0;
  if (giro <= 0) return 'Sin giro: la inscripción queda exonerada de comisión.';
  const porcentaje = redondear(giro * TASA_COMISION);
  return porcentaje < COMISION_MINIMA
    ? `1.5 % de ${formatearSoles(giro)} = ${formatearSoles(porcentaje)} → se aplica la comisión mínima de ${formatearSoles(COMISION_MINIMA)}.`
    : `1.5 % de ${formatearSoles(giro)} = ${formatearSoles(porcentaje)}.`;
}

// Código de seguimiento de 12 caracteres: "BPS-" + 8 dígitos (ej. BPS-73920481)
export function generarCodigoSeguimiento() {
  const tiempo = Date.now().toString().slice(-5);
  const azar = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `BPS-${tiempo}${azar}`;
}
