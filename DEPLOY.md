# Publicar Shira App en el VPS (Hostinger + EasyPanel)

Guía para poner la app en línea con dominio propio y HTTPS.
La app corre como **un contenedor Docker** (Next.js standalone) y habla
directo con Supabase. No hay base de datos que instalar en el VPS.

---

## 1. Subir el código a GitHub (repo **privado**)

El repositorio es la carpeta `shira-app/`.

1. Entra a <https://github.com/new>
2. Nombre: `shira-app` · Visibilidad: **Private** · No agregues README ni .gitignore.
3. Copia la URL que te da (ej. `https://github.com/TU-USUARIO/shira-app.git`).
4. En tu PC, dentro de `shira-app/`:

```bash
git remote add origin https://github.com/TU-USUARIO/shira-app.git
git branch -M main
git push -u origin main
```

> `.env.local` está en `.gitignore`: tus claves **no** se suben. ✅

---

## 2. Instalar EasyPanel en el VPS (solo la primera vez)

Conéctate por SSH a tu VPS (Ubuntu) y corre:

```bash
curl -sSL https://get.easypanel.io | sh
```

Al terminar, abre el panel en `http://TU-IP-DEL-VPS:3000` y crea tu cuenta de administrador.

---

## 3. Apuntar el dominio al VPS

En tu proveedor de DNS (donde administras `libreriashira.com`), crea un registro:

| Tipo | Nombre | Valor |
|---|---|---|
| `A` | `sistema` | La IP de tu VPS |

Eso te dará `sistema.libreriashira.com`. (Puedes usar el subdominio que quieras.)

---

## 4. Crear el servicio en EasyPanel

1. **Create Project** → nómbralo `shira`.
2. Dentro del proyecto: **+ Service → App**. Nombre: `app`.
3. **Source**: elige **GitHub**, autoriza tu cuenta y selecciona el repo `shira-app`, rama `main`.
4. **Build**: método **Dockerfile** (EasyPanel detecta el `Dockerfile` en la raíz).

### 4.1 Variables de entorno: **no hay que configurar nada** ✅

Las claves públicas de Supabase viven en **`.env.production`** (versionado en el
repo) y Next.js las lee sola durante el build. No necesitas *build args* ni
variables en la sección **Entorno**.

> **Por qué está bien tenerlas en el repo:** `NEXT_PUBLIC_*` significa que viajan
> dentro del JavaScript que descarga cada navegador — son públicas por diseño.
> Quien protege los datos es el **RLS de Supabase**. La clave `service_role`
> (esa sí secreta) no se usa ni está en el repo.
>
> Si algún día cambian esos valores: edítalos en `.env.production`, haz push y
> vuelve a desplegar (se incrustan al compilar, no en ejecución).

### 4.2 Puerto

En **Domains / Proxy**, configura el puerto interno del contenedor: **3000**.

---

## 5. Dominio y HTTPS

1. En el servicio → **Domains** → **Add Domain**.
2. Escribe `sistema.libreriashira.com`, puerto **3000**.
3. Activa **HTTPS / SSL** (EasyPanel emite el certificado con Let's Encrypt, gratis).

---

## 6. Desplegar

Botón **Deploy**. La primera vez tarda unos minutos (descarga Node, instala
dependencias y compila). Cuando termine, entra a `https://sistema.libreriashira.com`.

---

## 7. Ajuste final en Supabase

En Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://sistema.libreriashira.com`

(Necesario para que los correos de recuperación de contraseña apunten bien.)

---

## Actualizar la app después

```bash
git add -A
git commit -m "cambios"
git push
```

Luego, en EasyPanel, botón **Deploy** (o activa *Auto Deploy* para que se
publique solo con cada push).

---

## Notas

- **Recursos**: la app usa poca RAM (~100–200 MB). Cualquier VPS de 1–2 GB sobra.
- **Seguridad**: la clave `anon` es pública por diseño; quien protege los datos
  es el **RLS de Supabase**. Nunca pongas la `service_role` en build args.
- **Migraciones**: los SQL de `supabase/migrations/` se aplican en el SQL Editor
  de Supabase, no en el VPS.
- Si EasyPanel cambia de versión, los nombres de los botones pueden variar un
  poco, pero el flujo es el mismo: repo → Dockerfile → build args → dominio.
