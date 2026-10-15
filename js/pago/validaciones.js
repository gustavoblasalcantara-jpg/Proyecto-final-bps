// js/pago/validaciones.js
// Funciones PURAS de validación del lado del cliente. Pruébalas en la consola:
//   validarLuhn('4111 1111 1111 1111') → true
//   validarLuhn('4111 1111 1111 1112') → false

export const soloDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

// Algoritmo de Luhn (módulo 10): detecta errores de tipeo en el número de tarjeta
export function validarLuhn(numero) {
  const digitos = soloDigitos(numero);
  if (digitos.length < 13 || digitos.length > 19) return false;
  let suma = 0;
  let duplicar = false;
  for (let i = digitos.length - 1; i >= 0; i--) { // de derecha a izquierda
    let d = Number(digitos[i]);
    if (duplicar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    duplicar = !duplicar;
  }
  return suma % 10 === 0;
}

// La marca se reconoce por los primeros dígitos (BIN)
export function detectarMarca(numero) {
  const n = soloDigitos(numero);
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'American Express';
  return null;
}

const LONGITUDES = { 'Visa': [13, 16, 19], 'Mastercard': [16], 'American Express': [15] };

export const longitudValida = (numero, marca) =>
  (LONGITUDES[marca] ?? []).includes(soloDigitos(numero).length);

// "4111111111111111" -> "4111 1111 1111 1111" mientras el usuario escribe
export const formatearNumeroTarjeta = (valor) =>
  soloDigitos(valor).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

// "1229" -> "12/29"
export function formatearVencimiento(valor) {
  const d = soloDigitos(valor).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

// Devuelve { mes, anio } si "MM/AA" es válido y la tarjeta no venció; si no, null
export function validarVencimiento(texto, hoy = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(texto ?? '');
  if (!m) return null;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const primerDiaMesSiguiente = new Date(anio, mes, 1); // vence al terminar el mes indicado
  return primerDiaMesSiguiente > hoy ? { mes, anio } : null;
}

export function validarCVV(cvv, marca) {
  const largo = marca === 'American Express' ? 4 : 3;
  return new RegExp(`^\\d{${largo}}$`).test(cvv ?? '');
}

export const validarTitular = (nombre) =>
  /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü ]{5,60}$/.test((nombre ?? '').trim());

export const validarCelular = (cel) => /^9\d{8}$/.test(soloDigitos(cel));

export const validarCodigoAprobacion = (cod) => /^\d{6}$/.test(cod ?? '');

export const validarDNI = (dni) => /^\d{8}$/.test(dni ?? '');

export const enmascararTarjeta = (numero) => '**** ' + soloDigitos(numero).slice(-4);

export const enmascararCelular = (cel) => '*** *** ' + soloDigitos(cel).slice(-3);

export function generarCodigoOperacion(prefijo = 'OP') {
  const aleatorio = Math.floor(Math.random() * 900 + 100);
  return `${prefijo}-${Date.now().toString().slice(-8)}${aleatorio}`;
}

// Valida todo el formulario de tarjeta y devuelve los errores por campo
export function validarFormularioTarjeta({ numero, vencimiento, cvv, titular }) {
  const errores = {};
  const marca = detectarMarca(numero);
  if (!marca) errores.numero = 'Marca de tarjeta no reconocida.';
  else if (!longitudValida(numero, marca)) errores.numero = `Una tarjeta ${marca} no tiene esa cantidad de dígitos.`;
  else if (!validarLuhn(numero)) errores.numero = 'El número de tarjeta no es válido (falla el algoritmo de Luhn).';

  const venc = validarVencimiento(vencimiento);
  if (!venc) errores.vencimiento = 'Fecha inválida o tarjeta vencida (formato MM/AA).';

  if (!validarCVV(cvv, marca)) {
    errores.cvv = marca === 'American Express' ? 'El CVV tiene 4 dígitos.' : 'El CVV tiene 3 dígitos.';
  }
  if (!validarTitular(titular)) errores.titular = 'Escribe el nombre como figura en la tarjeta.';

  return { valido: Object.keys(errores).length === 0, errores, marca, venc };
}
