// js/auth/login.js — script propio de login.html
import { iniciarSesion, registrarUsuario, rutaInicioSegunRol } from './auth.js';
import { mostrarConfirmacion } from '../ui/ui.js';
import { validarDNI } from '../pago/validaciones.js';

/* ---------- Tarjeta 3D: alternar entre "Iniciar sesión" y "Crear cuenta" ---------- */
const volteo = document.querySelector('#volteo');
const tabLogin = document.querySelector('#tab-login');
const tabRegistro = document.querySelector('#tab-registro');
const caraLogin = document.querySelector('#cara-login');
const caraRegistro = document.querySelector('#cara-registro');

function mostrarCara(registro) {
  volteo.classList.toggle('volteado', registro);
  tabLogin.classList.toggle('activa', !registro);
  tabRegistro.classList.toggle('activa', registro);
  tabLogin.setAttribute('aria-selected', String(!registro));
  tabRegistro.setAttribute('aria-selected', String(registro));
  // La cara oculta queda inerte: no recibe foco ni clics
  caraLogin.inert = registro;
  caraRegistro.inert = !registro;
  setTimeout(() => (registro ? caraRegistro : caraLogin).querySelector('input')?.focus(), 450);
}
tabLogin.addEventListener('click', () => mostrarCara(false));
tabRegistro.addEventListener('click', () => mostrarCara(true));

/* ---------- Iniciar sesión: el rol decide a qué página se redirige ---------- */
const formLogin = document.querySelector('#form-login');
const boxLogin = document.querySelector('#mensaje-login');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!formLogin.checkValidity()) { formLogin.reportValidity(); return; }
  const btn = document.querySelector('#btn-login');
  const { correo, contrasena } = Object.fromEntries(new FormData(formLogin));
  try {
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    const usuario = await iniciarSesion(correo.trim(), contrasena);
    if (!usuario) {
      mostrarConfirmacion(boxLogin, { titulo: 'Correo o contraseña incorrectos', tipo: 'error' });
      return;
    }
    mostrarConfirmacion(boxLogin, {
      titulo: `¡Bienvenido(a), ${usuario.nombre}!`,
      detalle: `Perfil: ${usuario.rol}. Redirigiendo…`
    });
    setTimeout(() => { window.location.href = rutaInicioSegunRol(usuario.rol); }, 1300);
  } catch (err) {
    console.error(err);
    mostrarConfirmacion(boxLogin, { titulo: 'Error de conexión', detalle: err.message, tipo: 'error' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

/* ---------- Crear cuenta (siempre rol cliente) ---------- */
const formReg = document.querySelector('#form-registro');
const boxReg = document.querySelector('#mensaje-registro');
const inputDni = document.querySelector('#reg-dni');
inputDni.addEventListener('input', () => { inputDni.value = inputDni.value.replace(/\D/g, '').slice(0, 8); });

formReg.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!formReg.checkValidity()) { formReg.reportValidity(); return; }
  const datos = Object.fromEntries(new FormData(formReg));
  if (!validarDNI(datos.dni)) {
    mostrarConfirmacion(boxReg, { titulo: 'El DNI debe tener 8 dígitos', tipo: 'error' });
    return;
  }
  const btn = document.querySelector('#btn-registro');
  try {
    btn.disabled = true;
    btn.textContent = 'Registrando…';
    await registrarUsuario(datos.nombre.trim(), datos.correo.trim(), datos.contrasena, datos.dni);
    mostrarConfirmacion(boxReg, {
      titulo: '¡Cuenta creada!',
      detalle: 'Ahora inicia sesión con tu correo y contraseña.'
    });
    formReg.reset();
    setTimeout(() => {
      mostrarCara(false);
      document.querySelector('#login-correo').value = datos.correo.trim();
    }, 1800);
  } catch (err) {
    console.error(err);
    const repetido = err.code === '23505' || /duplicate|unique/i.test(err.message);
    mostrarConfirmacion(boxReg, {
      titulo: repetido ? 'Ese correo ya está registrado' : 'No se pudo crear la cuenta',
      detalle: repetido ? 'Inicia sesión o usa otro correo.' : err.message,
      tipo: 'error'
    });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear mi cuenta';
  }
});
