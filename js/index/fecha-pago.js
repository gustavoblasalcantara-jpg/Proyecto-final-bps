// js/index/fecha-pago.js — RF-5.2: consulta SIMULADA de fecha de pago por DNI (función pura)
// No consulta la base de datos: calcula el cronograma según el último dígito del DNI,
// como lo hacen los bancos estatales para repartir la afluencia de público.
//
//   calcularFechaPago('45781236', 'sueldo')   → { fecha, grupo, horario, ... }

// Sueldo público: se paga a partir del día indicado según el último dígito
const CRONOGRAMA_SUELDO = { 0: 19, 1: 19, 2: 19, 3: 20, 4: 20, 5: 20, 6: 21, 7: 21, 8: 21, 9: 21 };
// Programas sociales: cronograma escalonado del 10 al 14 de cada mes
const CRONOGRAMA_PROGRAMA = { 0: 10, 1: 10, 2: 11, 3: 11, 4: 12, 5: 12, 6: 13, 7: 13, 8: 14, 9: 14 };
// Franja horaria sugerida para evitar colas
const FRANJAS = ['8:00 – 10:00', '10:00 – 12:00', '12:00 – 14:00', '14:00 – 16:00', '16:00 – 18:00'];

// Si cae sábado o domingo, el pago pasa al lunes siguiente
function ajustarDiaHabil(fecha) {
  const f = new Date(fecha);
  const dia = f.getDay();
  if (dia === 6) f.setDate(f.getDate() + 2);
  if (dia === 0) f.setDate(f.getDate() + 1);
  return f;
}

export function calcularFechaPago(dni, tipo = 'sueldo', hoy = new Date()) {
  if (!/^\d{8}$/.test(dni ?? '')) return null;
  const ultimo = Number(dni.at(-1));
  const cronograma = tipo === 'programa' ? CRONOGRAMA_PROGRAMA : CRONOGRAMA_SUELDO;
  const diaBase = cronograma[ultimo];

  const base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let fecha = ajustarDiaHabil(new Date(base.getFullYear(), base.getMonth(), diaBase));
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (fecha < inicioHoy) {
    fecha = ajustarDiaHabil(new Date(base.getFullYear(), base.getMonth() + 1, diaBase));
  }
  const dias = Math.round((fecha - inicioHoy) / 86400000);

  return {
    fecha,
    dias,
    ultimoDigito: ultimo,
    horario: FRANJAS[ultimo % FRANJAS.length],
    concepto: tipo === 'programa' ? 'Programa social' : 'Sueldo del sector público',
    canal: tipo === 'programa'
      ? 'Agencia BPS o agencia móvil de tu distrito'
      : 'Cajero BPS, agencia o banca por internet'
  };
}

export function formatearFechaLarga(fecha) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
}
