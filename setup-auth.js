/**
 * setup-auth.js
 * Conectar una cuenta de Google con la API.
 *
 * Uso:
 *   node setup-auth.js           → genera token.json  (cuenta principal)
 *   node setup-auth.js --cuenta=2 → genera token2.json (segunda cuenta)
 */

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const readline = require('readline')

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json')
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
]

async function main() {
  const arg    = process.argv.find(a => a.startsWith('--cuenta='))
  const suffix = arg ? arg.split('=')[1] : ''
  const tokenFile = `token${suffix}.json`
  const TOKEN_PATH = path.join(__dirname, tokenFile)

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('\n❌ No se encontró el archivo credentials.json')
    console.log('\nPara obtenerlo:')
    console.log('1. Ve a https://console.cloud.google.com')
    console.log('2. Crea un proyecto nuevo (ponle cualquier nombre)')
    console.log('3. Activa "Google Sheets API" y "Google Drive API"')
    console.log('4. Crea credenciales OAuth 2.0 → tipo "App de escritorio"')
    console.log('5. Descarga el JSON → guárdalo como credentials.json en esta carpeta')
    console.log('\nDespués vuelve a ejecutar: node setup-auth.js\n')
    process.exit(1)
  }

  const etiq = suffix ? ` (cuenta ${suffix})` : ' (cuenta principal)'
  console.log(`\n🔑 Configurando autenticación${etiq} → se guardará en ${tokenFile}`)

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH))
  const { client_secret, client_id, redirect_uris } = credentials.installed
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\nAbre este link en tu navegador e inicia sesión con la cuenta de Google que deseas conectar:')
  console.log('\n' + authUrl + '\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Después de autorizar, pega aquí el código que aparece en pantalla: ', async (code) => {
    rl.close()
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim())
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
      console.log(`\n✅ ¡Listo! Autenticación guardada en ${tokenFile}`)
      if (suffix) {
        console.log('La segunda cuenta ya está lista. node exportar-activos.js exportará a ambas cuentas.\n')
      } else {
        console.log('Ya puedes usar: node exportar.js\n')
      }
    } catch (err) {
      console.error('\n❌ Error al obtener el token:', err.message)
    }
  })
}

main()
