======================================
REPORTE DE ASISTENCIA → GOOGLE SHEETS
======================================

Extrae asistencia de Supabase y la sube a Google Sheets
con el formato oficial (colores, palomitas, agrupación por líder).

======================================
CONFIGURACIÓN INICIAL (solo 1 vez)
======================================

PASO 1: Instalar dependencias
------------------------------
En la Terminal:
  cd "PROYECTO ASISTENCIA IGLESIA/reporte-asistencia"
  npm install

PASO 2: Obtener credentials.json de Google
-------------------------------------------
1. Ve a https://console.cloud.google.com
2. Crea un proyecto nuevo (nombre: "reporte-iglesia" o cualquiera)
3. Menú izquierdo → "APIs y servicios" → "Biblioteca"
   - Busca "Google Sheets API" → Activar
   - Busca "Google Drive API" → Activar
4. Menú → "APIs y servicios" → "Credenciales"
5. Clic en "Crear credenciales" → "ID de cliente OAuth 2.0"
6. Tipo: "App de escritorio" → Nombre: "reporte-asistencia"
7. Descargar JSON → guardarlo como credentials.json en esta carpeta

PASO 3: Autenticarse con sanidadmasvida@gmail.com
---------------------------------------------------
En la Terminal:
  node setup-auth.js

Abre el link que aparece en el navegador, inicia sesión con
sanidadmasvida@gmail.com y autoriza el acceso.
Pega el código de vuelta en la Terminal.

Este paso solo se hace UNA VEZ. Queda guardado en token.json.

======================================
USO DIARIO
======================================

Solo dile a Claude:
  "Exporta la asistencia de Sanidad Emocional Domingo, Mayo 2026"

Claude corre el script y te da el link del Google Sheet.
El sheet se crea directamente en el Drive de sanidadmasvida@gmail.com
con los colores y formato oficial.

Si ya existe un sheet del mismo mes/clase, se actualiza en lugar
de crear uno nuevo.

======================================
CLASES DISPONIBLES
======================================

  SE-DO = Sanidad Emocional, Domingo    (Salon UM1)
  SE-MI = Sanidad Emocional, Miércoles  (Salon UM1)
  SR-DO = Sanidad en Relaciones, Domingo    (Salon UM2)
  SR-MI = Sanidad en Relaciones, Miércoles  (Salon UM2)

======================================
