/**
 * exportar.js
 * Extrae asistencia de Supabase y genera un Google Sheet con el formato oficial.
 *
 * Uso: node exportar.js <class_id> <mes_numero> <año>
 * Ejemplos:
 *   node exportar.js SE-DO 5 2026   (Sanidad Emocional Domingo, Mayo 2026)
 *   node exportar.js SR-MI 5 2026   (Sanidad en Relaciones Miércoles, Mayo 2026)
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { google } = require('googleapis')

// ─── Configuración ────────────────────────────────────────────────────────────

const TOKEN_PATH       = path.join(__dirname, 'token.json')
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json')

const CLASS_MAP = {
  'SE-MI': { nombre: 'Sanidad Emocional',     salon: 'UM1', dia: 'Miércoles' },
  'SR-MI': { nombre: 'Sanidad en Relaciones', salon: 'UM2', dia: 'Miércoles' },
  'SE-DO': { nombre: 'Sanidad Emocional',     salon: 'UM1', dia: 'Domingo'   },
  'SR-DO': { nombre: 'Sanidad en Relaciones', salon: 'UM2', dia: 'Domingo'   },
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const COLOR_SALMON     = { red: 0.98, green: 0.86, blue: 0.85 }
const COLOR_BLANCO     = { red: 1,    green: 1,    blue: 1    }
const COLOR_HEADER_SES = { red: 0.75, green: 0.22, blue: 0.17 }
const COLOR_HEADER_BG  = { red: 0.95, green: 0.95, blue: 0.95 }

// ─── Autenticación Google ─────────────────────────────────────────────────────

function getAuth() {
  let credentials, token

  // En GitHub Actions las credenciales vienen como variables de entorno
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    token = JSON.parse(process.env.GOOGLE_TOKEN_JSON)
  } else {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error('❌ No se encontró credentials.json')
      console.error('   Revisa el README.txt para instrucciones.')
      process.exit(1)
    }
    if (!fs.existsSync(TOKEN_PATH)) {
      console.error('❌ No se encontró token.json')
      console.error('   Ejecuta primero: node setup-auth.js')
      process.exit(1)
    }
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
    token = JSON.parse(fs.readFileSync(TOKEN_PATH))
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  auth.setCredentials(token)

  // Guardar token actualizado solo si corremos en local
  if (!process.env.GOOGLE_CREDENTIALS_JSON) {
    auth.on('tokens', (tokens) => {
      const current = JSON.parse(fs.readFileSync(TOKEN_PATH))
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2))
    })
  }

  return auth
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function fetchDatos(classId, month, year) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

  const { data: season, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('class_id', classId)
    .eq('month', month)
    .eq('year', year)
    .single()

  if (error || !season) {
    console.error(`❌ No se encontró temporada: ${CLASS_MAP[classId].nombre} - ${MESES[month]} ${year}`)
    console.error('   Verifica que la temporada existe en la app.')
    process.exit(1)
  }

  const { data: circles } = await supabase
    .from('circles')
    .select('*')
    .eq('class_id', classId)
    .eq('season_id', season.id)
    .order('leader_name')

  if (!circles || circles.length === 0) {
    console.error('❌ No se encontraron círculos para esta temporada.')
    process.exit(1)
  }

  const grupos = []
  for (const circle of circles) {
    const { data: students } = await supabase
      .from('students')
      .select('*')
      .eq('circle_id', circle.id)
      .order('name')

    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')
      .eq('circle_id', circle.id)
      .eq('season_id', season.id)

    grupos.push({ circle, students: students || [], attendance: attendance || [] })
  }

  return grupos
}

// ─── Construcción de datos ────────────────────────────────────────────────────

function construirDatos(classId, grupos) {
  const info = CLASS_MAP[classId]

  const fechasSet = new Set()
  for (const { attendance } of grupos) {
    for (const a of attendance) fechasSet.add(a.session_date)
  }
  const fechas = Array.from(fechasSet).sort()

  const filas = []
  let grupoIndex = 0

  for (const { circle, students, attendance } of grupos) {
    const asistioEn = {}
    for (const a of attendance) {
      if (!asistioEn[a.student_id]) asistioEn[a.student_id] = new Set()
      asistioEn[a.student_id].add(a.session_date)
    }

    let primeraFila = true
    for (const student of students) {
      const sesiones = fechas.map(f => asistioEn[student.id]?.has(f) ? '✓' : '')
      filas.push({
        clase:      info.nombre,
        lider:      primeraFila ? (circle.leader_name || '') : '',
        nombre:     student.name,
        numero:     student.phone || '',
        salon:      info.salon,
        dia:        info.dia,
        registro:   'SI',
        sesiones,
        grupoIndex,
      })
      primeraFila = false
    }
    grupoIndex++
  }

  return { filas, fechas }
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

async function buscarOCrearSheet(drive, sheets, titulo) {
  const { data } = await drive.files.list({
    q: `name='${titulo}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (data.files && data.files.length > 0) {
    console.log(`📄 Actualizando sheet existente: "${titulo}"`)
    return data.files[0].id
  }

  console.log(`📄 Creando nuevo sheet: "${titulo}"`)
  const { data: file } = await sheets.spreadsheets.create({
    requestBody: { properties: { title: titulo } },
  })
  return file.spreadsheetId
}

async function escribirSheet(auth, spreadsheetId, filas, fechas) {
  const sheets   = google.sheets({ version: 'v4', auth })
  const sheetId  = 0
  const numInfo  = 7
  const numSes   = fechas.length
  const totalCol = numInfo + numSes

  const encabezados = [
    'Clase', 'Lider de grupo', 'Nombre', 'Numero', 'Salon', 'Dia de sesion',
    'Registro en plataforma',
    ...fechas.map((_, i) => `Sesion ${i + 1}`),
  ]

  const valores = [
    encabezados,
    ...filas.map(f => [f.clase, f.lider, f.nombre, f.numero, f.salon, f.dia, f.registro, ...f.sesiones]),
  ]

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'A1:ZZ10000' })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'A1',
    valueInputOption: 'RAW',
    requestBody: { values: valores },
  })

  const requests = []

  // Anchos de columna
  const anchos = [160, 120, 200, 115, 60, 100, 150]
  anchos.forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    })
  })
  if (numSes > 0) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: numInfo, endIndex: numInfo + numSes },
        properties: { pixelSize: 75 },
        fields: 'pixelSize',
      },
    })
  }

  // Encabezado — columnas de información
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numInfo },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLOR_HEADER_BG,
          textFormat: { bold: true },
          borders: {
            top:    { style: 'SOLID', width: 1 },
            bottom: { style: 'SOLID', width: 2 },
            left:   { style: 'SOLID', width: 1 },
            right:  { style: 'SOLID', width: 1 },
          },
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,borders,verticalAlignment)',
    },
  })

  // Encabezado — columnas de sesiones (rojo oscuro)
  if (numSes > 0) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: numInfo, endColumnIndex: numInfo + numSes },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR_HEADER_SES,
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            borders: {
              top:    { style: 'SOLID', width: 1 },
              bottom: { style: 'SOLID', width: 2 },
              left:   { style: 'SOLID', width: 1 },
              right:  { style: 'SOLID', width: 1 },
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,borders,horizontalAlignment,verticalAlignment)',
      },
    })
  }

  // Filas de datos — color alternado por grupo
  for (let i = 0; i < filas.length; i++) {
    const rowIdx = i + 1
    const bg = filas[i].grupoIndex % 2 === 0 ? COLOR_BLANCO : COLOR_SALMON
    const borde = { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } }

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: numInfo },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            borders: { top: borde, bottom: borde, left: borde, right: borde },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,borders,verticalAlignment)',
      },
    })

    if (numSes > 0) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: numInfo, endColumnIndex: numInfo + numSes },
          cell: {
            userEnteredFormat: {
              backgroundColor: bg,
              borders: { top: borde, bottom: borde, left: borde, right: borde },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,borders,horizontalAlignment,verticalAlignment)',
        },
      })
    }
  }

  // Congelar fila de encabezado y renombrar hoja
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, title: 'Asistencias Sanidad', gridProperties: { frozenRowCount: 1 } },
      fields: 'title,gridProperties.frozenRowCount',
    },
  })

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

async function compartirSheet(auth, spreadsheetId) {
  const drive      = google.drive({ version: 'v3', auth })
  const shareEmail = process.env.SHARE_EMAIL
  if (!shareEmail) return

  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: 'user', role: 'writer', emailAddress: shareEmail },
      sendNotificationEmail: false,
    })
    console.log(`✅ Sheet compartido con ${shareEmail}`)
  } catch (err) {
    if (!err.message?.includes('already')) {
      console.warn(`⚠️  No se pudo compartir con ${shareEmail}: ${err.message}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [classId, mesArg, yearArg] = process.argv.slice(2)

  if (!classId || !mesArg || !yearArg) {
    console.log('\nUso: node exportar.js <class_id> <mes> <año>')
    console.log('Ejemplos:')
    console.log('  node exportar.js SE-DO 5 2026')
    console.log('  node exportar.js SR-MI 5 2026')
    console.log('\nClases: SE-DO, SE-MI, SR-DO, SR-MI\n')
    process.exit(1)
  }

  if (!CLASS_MAP[classId]) {
    console.error(`❌ Clase no reconocida: ${classId}. Usa: SE-DO, SE-MI, SR-DO, SR-MI`)
    process.exit(1)
  }

  const month = parseInt(mesArg) - 1
  const year  = parseInt(yearArg)
  const info  = CLASS_MAP[classId]

  console.log(`\n🔄 Exportando: ${info.nombre} (${info.dia}) - ${MESES[month]} ${year}`)
  console.log('─'.repeat(50))

  const auth   = getAuth()
  const drive  = google.drive({ version: 'v3', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  console.log('📡 Obteniendo datos de Supabase...')
  const grupos = await fetchDatos(classId, month, year)

  let total = 0
  for (const g of grupos) total += g.students.length
  console.log(`   ${grupos.length} círculos, ${total} estudiantes`)

  const { filas, fechas } = construirDatos(classId, grupos)
  console.log(`   ${fechas.length} sesión(es) registradas`)

  const titulo = `Asistencia - ${info.nombre} - ${MESES[month]} ${year}`
  const spreadsheetId = await buscarOCrearSheet(drive, sheets, titulo)

  console.log('✍️  Escribiendo datos y formato...')
  await escribirSheet(auth, spreadsheetId, filas, fechas)

  await compartirSheet(auth, spreadsheetId)

  console.log(`\n✅ ¡Listo!`)
  console.log(`🔗 https://docs.google.com/spreadsheets/d/${spreadsheetId}\n`)
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
