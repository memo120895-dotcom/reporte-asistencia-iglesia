/**
 * exportar-activos.js
 * Exporta todas las temporadas activas a Google Sheets.
 * Crea UN spreadsheet por mes/año con UNA PESTAÑA POR CLASE.
 *
 * Uso: node exportar-activos.js
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const { google } = require('googleapis')
const { exportarClase, getAuth, buscarOCrearSpreadsheet, compartirSheet, MESES } = require('./exportar')

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

  const { data: seasons, error } = await supabase.from('seasons').select('*').eq('active', true)

  if (error || !seasons || seasons.length === 0) {
    console.log('ℹ️  No hay temporadas activas.')
    return
  }

  console.log(`\n🔄 ${seasons.length} temporada(s) activa(s)\n`)

  // Agrupar por mes + año → un spreadsheet por grupo
  const grupos = {}
  for (const s of seasons) {
    const key = `${s.year}-${String(s.month).padStart(2,'0')}`
    if (!grupos[key]) grupos[key] = { month: s.month, year: s.year, seasons: [] }
    grupos[key].seasons.push(s)
  }

  const cuentas = [getAuth(), getAuth('2')].filter(Boolean)
  console.log(`🔑 Cuentas de Google configuradas: ${cuentas.length}\n`)

  let exitosos = 0, fallidos = 0

  for (const { month, year, seasons: grupo } of Object.values(grupos)) {
    const titulo = `Asistencia - ${MESES[month]} ${year}`

    for (let i = 0; i < cuentas.length; i++) {
      const auth    = cuentas[i]
      const etiq    = cuentas.length > 1 ? ` [Cuenta ${i + 1}]` : ''
      const drive   = google.drive({ version: 'v3', auth })
      const sheets  = google.sheets({ version: 'v4', auth })

      console.log(`📊 ${titulo}${etiq}`)

      const spreadsheetId = await buscarOCrearSpreadsheet(drive, sheets, titulo)

      for (const season of grupo) {
        try {
          const { CLASS_MAP } = require('./exportar')
          const info    = CLASS_MAP[season.class_id]
          const tabName = `${info.nombre} - ${info.dia}`

          await exportarClase(season.class_id, season.month, season.year, {
            auth, spreadsheetId, tabName,
          })
          exitosos++
        } catch (err) {
          console.error(`  ❌ Error en ${season.class_id}: ${err.message}`)
          fallidos++
        }
      }

      await compartirSheet(auth, spreadsheetId)
      console.log(`  🔗 https://docs.google.com/spreadsheets/d/${spreadsheetId}\n`)
    }
  }

  console.log('─'.repeat(50))
  console.log(`✅ Exitosos: ${exitosos} | ❌ Fallidos: ${fallidos}\n`)
}

main().catch(err => {
  console.error('Error inesperado:', err.message)
  process.exit(1)
})
