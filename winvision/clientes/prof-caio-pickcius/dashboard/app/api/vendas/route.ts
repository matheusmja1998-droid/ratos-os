import { NextResponse } from 'next/server'

const SHEET_ID = '1yYf7mz3P1YxxOPddSD-EO2r634FjAHQmMcnUFfydcfA'
const RANGE = 'Vendas gerais!A:M'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${apiKey}`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch sheet' }, { status: 500 })
  }

  const data = await res.json()
  const rows: string[][] = data.values || []

  const records = rows.slice(1).map((row) => ({
    data_compra:  row[0]  || '',
    nome:         row[2]  || '',
    sobrenome:    row[3]  || '',
    email:        row[4]  || '',
    produto:      row[6]  || '',
    valor:        row[7]  || '',
    utm_medium:   row[9]  || '',
    utm_content:  row[10] || '',
    utm_term:     row[11] || '',
    utm_campaign: row[12] || '',
  }))

  return NextResponse.json({ records })
}
