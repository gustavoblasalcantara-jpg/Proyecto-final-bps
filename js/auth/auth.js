// js/auth/auth.js — cuentas, sesión y control de acceso por rol
import { sql } from '../config/neon-config.js';

// Registrar nuevo usuario (rol por defecto: cliente).
// Nota académica: la contraseña se guarda en texto plano solo con fines didácticos;
// en un sistema real se guardaría con hash (por ejemplo bcrypt), nunca en texto plano.
export async function registrarUsuario(nombre, correo, contrasena, dni = null) {
  const resultado = await sql`
    INSERT INTO usuarios (nombre, correo, contrasena, rol, dni)
    VALUES (${nombre}, ${correo}, ${contrasena}, 'cliente', ${dni})
    RETURNING id, nombre, correo, rol;
  `;
  return resultado[0];
}

// Iniciar sesión: devuelve id, nombre, correo, rol y dni, y guarda la sesión
export async function iniciarSesion(correo, contrasena) {
  const usuarios = await sql`
    SELECT id, nombre, correo, rol, dni
    FROM usuarios
    WHERE correo = ${correo} AND contrasena = ${contrasena};
  `;
  if (usuarios.length === 0) return null;
  const usuario = usuarios[0];
  sessionStorage.setItem('usuario', JSON.stringify(usuario));
  return usuario;
}

// Devuelve el usuario en sesión sin redirigir (útil para index.html)
export function usuarioActual() {
  try {
    const dato = sessionStorage.getItem('usuario');
    return dato ? JSON.parse(dato) : null;
  } catch {
    return null;
  }
}

// Verificar sesión activa: devuelve el usuario o redirige a login.html
export function exigirSesion() {
  const usuario = usuarioActual();
  if (!usuario) {
    window.location.href = 'login.html';
    return null;
  }
  return usuario;
}

// Verificar que el usuario tenga uno de los roles permitidos
export function exigirRol(...rolesPermitidos) {
  const usuario = exigirSesion();
  if (!usuario) return null;
  if (!rolesPermitidos.includes(usuario.rol)) {
    alert('Tu perfil no tiene acceso a esta página.');
    window.location.href = 'index.html';
    return null;
  }
  return usuario;
}

// Página de inicio de cada rol después de iniciar sesión
export function rutaInicioSegunRol(rol) {
  const rutas = {
    cliente: 'registro.html',
    administrador: 'panel.html',
    empleado: 'panel.html',
    cajero: 'caja.html'
  };
  return rutas[rol] ?? 'index.html';
}

// Cerrar sesión
export function cerrarSesion() {
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html';
}
