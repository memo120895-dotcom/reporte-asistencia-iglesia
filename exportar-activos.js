/**
 * exportar-activos.js
 * Busca todas las temporadas activas en Supabase y exporta cada una a Google Sheets.
 * Este es el script que corre automáticamente en GitHub Actions.
 *
 * Uso: node exportar-activos.js
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const { execSync } = require('child_process')

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

  const { data: seasons, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('active', true)

  if (error || !seasons || seasons.length === 0) {
    console.log('ℹ️  No hay temporadas activas en este momento.')
    return
  }

  console.log(`\n🔄 Exportando ${seasons.length} temporada(s) activa(s)...\n`)

  let exitosos = 0
  let fallidos = 0

  for (const season of seasons) {
    const mes = season.month + 1 // Supabase guarda 0-11, el script espera 1-12
    console.log(`── ${season.class_id} | ${MESES[season.month]} ${season.year}`)
    try {
      execSync(`node exportar.js ${season.class_id} ${mes} ${season.year}`, {
        stdio: 'inherit',
        cwd: __dirname,
      })
      exitosos++
    } catch {
      console.error(`   ❌ Falló la exportación de ${season.class_id}`)
      fallidos++
    }
    console.log()
  }

  console.log('─'.repeat(50))
  console.log(`✅ Exportados: ${exitosos} | ❌ Fallidos: ${fallidos}\n`)
}

main().catch(err => {
  console.error('Error inesperado:', err.message)
  process.exit(1)
})
