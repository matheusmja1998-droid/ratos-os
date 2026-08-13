'use client'

import { useEffect, useState, useMemo } from 'react'

type Venda = {
  data_compra: string
  nome: string
  sobrenome: string
  email: string
  produto: string
  valor: string
  utm_medium: string
  utm_content: string
  utm_term: string
  utm_campaign: string
}

type SpendRow = { date: string; campaign: string; spend: number }

type GroupRow = { key: string; count: number; spend?: number; cpa?: number | null; revenue?: number; ticket?: number | null }

function parseDate(str: string): Date | null {
  const parts = str.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

// Spend sheet uses ISO yyyy-mm-dd
function parseISO(str: string): Date | null {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function parseBRL(str: string): number {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
}

function groupBy(records: Venda[], field: keyof Venda): GroupRow[] {
  const map: { [key: string]: number } = {}
  for (const r of records) {
    const key = r[field] || '(sem dados)'
    map[key] = (map[key] || 0) + 1
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))
}

function groupByCampaign(records: Venda[], spendByCampaign: Map<string, number>): GroupRow[] {
  const counts: { [key: string]: number } = {}
  const revenues: { [key: string]: number } = {}
  for (const r of records) {
    const key = r.utm_term || '(sem dados)'
    counts[key] = (counts[key] || 0) + 1
    revenues[key] = (revenues[key] || 0) + parseBRL(r.valor)
  }
  const allKeys = new Set<string>(Object.keys(counts))
  spendByCampaign.forEach((_, k) => allKeys.add(k))
  const rows: GroupRow[] = []
  allKeys.forEach((key) => {
    const count = counts[key] || 0
    const spend = spendByCampaign.get(key) || 0
    const revenue = revenues[key] || 0
    const cpa = count > 0 ? spend / count : null
    const ticket = count > 0 ? revenue / count : null
    rows.push({ key, count, spend, cpa, revenue, ticket })
  })
  return rows.sort((a, b) => (b.spend || 0) - (a.spend || 0))
}

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

function attributeOrderBumps(
  allRecords: Venda[],
  mainProducts: string[],
  filteredMain: Venda[]
): Venda[] {
  const filteredKeys = new Set(
    filteredMain.map((r) => `${r.email}||${r.data_compra}||${r.produto}||${r.valor}`)
  )

  const addedKeys = new Set<string>()
  const orderBumps: Venda[] = []

  for (let i = 0; i < allRecords.length; i++) {
    const r = allRecords[i]
    if (!mainProducts.includes(r.produto)) continue
    if (!filteredKeys.has(`${r.email}||${r.data_compra}||${r.produto}||${r.valor}`)) continue

    const neighbors = [
      i > 0 ? allRecords[i - 1] : null,
      allRecords[i + 1] ?? null,
    ].filter(Boolean) as Venda[]

    for (const nb of neighbors) {
      if (nb.email !== r.email) continue
      if (mainProducts.includes(nb.produto)) continue
      const nbKey = `${nb.email}||${nb.data_compra}||${nb.produto}||${nb.valor}`
      if (addedKeys.has(nbKey)) continue
      addedKeys.add(nbKey)
      orderBumps.push({
        ...nb,
        utm_term: r.utm_term,
        utm_content: r.utm_content,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
      })
    }
  }

  return [...filteredMain, ...orderBumps]
}

function Table({
  title,
  rows,
  accent,
  selectedKey,
  onRowClick,
}: {
  title: string
  rows: GroupRow[]
  accent: string
  selectedKey?: string | null
  onRowClick?: (key: string) => void
}) {
  const showSpend = rows.some((r) => r.spend !== undefined)
  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden">
      <div className={`px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-between ${accent}`}>
        <span>{title}</span>
        {onRowClick && <span className="text-[10px] opacity-50 font-normal normal-case">clique para filtrar</span>}
      </div>
      <table className="w-full text-sm">
        {showSpend && (
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-t border-slate-800">
              <th className="px-4 py-2 text-left font-medium">Campanha</th>
              <th className="px-2 py-2 text-right font-medium">Vendas</th>
              <th className="px-2 py-2 text-right font-medium">Ticket</th>
              <th className="px-2 py-2 text-right font-medium">Investido</th>
              <th className="px-4 py-2 text-right font-medium">CPA</th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-slate-500 text-xs" colSpan={showSpend ? 5 : 2}>Sem dados no período</td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const { key, count, spend, cpa, ticket } = row
              const isSelected = selectedKey === key
              return (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(key)}
                  className={`border-t border-slate-800 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${isSelected ? 'bg-blue-900/40' : 'hover:bg-slate-800/50'}`}
                >
                  <td className="px-4 py-2.5 text-xs leading-snug">
                    <span className={isSelected ? 'text-blue-300 font-medium' : 'text-slate-300'}>
                      {isSelected && '▶ '}{key}
                    </span>
                  </td>
                  <td className={`px-2 py-2.5 text-right font-bold tabular-nums w-14 ${isSelected ? 'text-blue-300' : 'text-white'}`}>
                    {count}
                  </td>
                  {showSpend && (
                    <>
                      <td className="px-2 py-2.5 text-right tabular-nums text-xs text-slate-300 w-24">
                        {ticket != null ? formatBRL(ticket) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-xs text-slate-300 w-24">
                        {spend ? formatBRL(spend) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-400 w-20">
                        {cpa != null ? formatBRL(cpa) : (spend ? '∞' : '—')}
                      </td>
                    </>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

const WT_PRODUCTS = ['Imersão Reset sem Scanner!']
const CL_PRODUCTS = [
  'Check-list Diagnóstico Injeção | HONDA – Versão 2026',
  'Apostila Pinagem ECM Central Honda (42 modelos motos)',
  'Apostila Pinagem Central Yamaha (14 motos)',
]

// Heurística: classifica uma campanha do Facebook como WT ou Checklist pelo nome
function classifyCampaign(name: string): 'wt' | 'cl' | null {
  const n = name.toUpperCase()
  if (n.includes('CHECKLIST') || n.includes('CHECK-LIST') || n.includes('CHECK LIST')) return 'cl'
  if (n.includes('WT-RE') || n.includes('WT_RE') || n.includes('[WT')) return 'wt'
  return null
}

export default function Dashboard() {
  const [records, setRecords] = useState<Venda[]>([])
  const [spend, setSpend] = useState<SpendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'wt' | 'checklist'>('wt')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [selectedCampaignWT, setSelectedCampaignWT] = useState<string | null>(null)
  const [selectedCampaignCL, setSelectedCampaignCL] = useState<string | null>(null)

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch('/api/vendas').then((r) => r.json()),
        fetch('/api/spend').then((r) => r.json()).catch(() => ({ records: [] })),
      ])
        .then(([v, s]) => {
          if (v.error) setError(v.error)
          else setRecords(v.records)
          setSpend(s.records || [])
          setLoading(false)
        })
        .catch(() => {
          setError('Erro ao carregar dados')
          setLoading(false)
        })
    }

    load()
    const interval = setInterval(load, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Spend filtrado pelo período + agregado por campanha
  const spendFiltered = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    return spend.filter((s) => {
      const d = parseISO(s.date)
      return d && d >= start && d <= end
    })
  }, [spend, startDate, endDate])

  const spendByCampaignWT = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of spendFiltered) {
      if (classifyCampaign(s.campaign) !== 'wt') continue
      m.set(s.campaign, (m.get(s.campaign) || 0) + s.spend)
    }
    return m
  }, [spendFiltered])

  const spendByCampaignCL = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of spendFiltered) {
      if (classifyCampaign(s.campaign) !== 'cl') continue
      m.set(s.campaign, (m.get(s.campaign) || 0) + s.spend)
    }
    return m
  }, [spendFiltered])

  const totalSpendWT = useMemo(() => {
    let s = 0; spendByCampaignWT.forEach((v) => { s += v }); return s
  }, [spendByCampaignWT])
  const totalSpendCL = useMemo(() => {
    let s = 0; spendByCampaignCL.forEach((v) => { s += v }); return s
  }, [spendByCampaignCL])

  const filtered = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    return records.filter((r) => {
      const date = parseDate(r.data_compra)
      return date && date >= start && date <= end
    })
  }, [records, startDate, endDate])

  const wtMain = useMemo(() => filtered.filter((r) => WT_PRODUCTS.includes(r.produto)), [filtered])
  const wt = useMemo(() => attributeOrderBumps(records, WT_PRODUCTS, wtMain), [records, wtMain])

  const clMain = useMemo(() => filtered.filter((r) => CL_PRODUCTS.includes(r.produto)), [filtered])
  const checklist = useMemo(() => attributeOrderBumps(records, CL_PRODUCTS, clMain), [records, clMain])

  const wtRevenue = useMemo(() => wt.reduce((s, r) => s + parseBRL(r.valor), 0), [wt])
  const clRevenue = useMemo(() => checklist.reduce((s, r) => s + parseBRL(r.valor), 0), [checklist])

  const wtDirect = wtMain.length
  const clDirect = clMain.length

  const wtSub = useMemo(
    () => (selectedCampaignWT ? wt.filter((r) => r.utm_term === selectedCampaignWT) : wt),
    [wt, selectedCampaignWT]
  )
  const clSub = useMemo(
    () => (selectedCampaignCL ? checklist.filter((r) => r.utm_term === selectedCampaignCL) : checklist),
    [checklist, selectedCampaignCL]
  )

  const toggleWT = (key: string) => setSelectedCampaignWT((p) => (p === key ? null : key))
  const toggleCL = (key: string) => setSelectedCampaignCL((p) => (p === key ? null : key))

  const wtRoas = totalSpendWT > 0 ? wtRevenue / totalSpendWT : null
  const clRoas = totalSpendCL > 0 ? clRevenue / totalSpendCL : null
  const wtCpa = wt.length > 0 && totalSpendWT > 0 ? totalSpendWT / wt.length : null
  const clCpa = checklist.length > 0 && totalSpendCL > 0 ? totalSpendCL / checklist.length : null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard de Vendas</h1>
        <p className="text-slate-400 text-sm">Prof. Caio Pickcius — Academia Mecânico Expert</p>
      </div>

      <div className="flex items-center gap-4 bg-slate-900 rounded-xl px-5 py-4 flex-wrap">
        <span className="text-slate-400 text-sm">Período:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <span className="text-slate-500 text-sm">até</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
        />
        {loading && <span className="text-slate-500 text-xs">Carregando...</span>}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('wt')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'wt' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Workshop WT
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === 'wt' ? 'bg-blue-500' : 'bg-slate-700'}`}>
            {wt.length}
          </span>
        </button>
        <button
          onClick={() => setTab('checklist')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'checklist' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Check-list Honda
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === 'checklist' ? 'bg-orange-500' : 'bg-slate-700'}`}>
            {checklist.length}
          </span>
        </button>
      </div>

      {tab === 'wt' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Vendas (diretas + bumps)</p>
              <p className="text-2xl font-bold text-blue-400">{wt.length}</p>
              <p className="text-[11px] text-slate-500 mt-1">{wtDirect} diretas · {wt.length - wtDirect} bumps</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Faturamento</p>
              <p className="text-2xl font-bold text-blue-400">{formatBRL(wtRevenue)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Ticket {wt.length > 0 ? formatBRL(wtRevenue / wt.length) : '—'}</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Investido</p>
              <p className="text-2xl font-bold text-rose-400">{formatBRL(totalSpendWT)}</p>
              <p className="text-[11px] text-slate-500 mt-1">CPA {wtCpa != null ? formatBRL(wtCpa) : '—'}</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">ROAS</p>
              <p className={`text-2xl font-bold ${wtRoas != null && wtRoas >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {wtRoas != null ? wtRoas.toFixed(2) + 'x' : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Lucro {formatBRL(wtRevenue - totalSpendWT)}</p>
            </div>
          </div>

          {selectedCampaignWT && (
            <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-xl px-4 py-2.5">
              <span className="text-blue-300 text-sm truncate">
                Filtrando: <strong>{selectedCampaignWT}</strong>
              </span>
              <button
                onClick={() => setSelectedCampaignWT(null)}
                className="ml-auto shrink-0 text-blue-400 hover:text-white text-xs bg-blue-800/50 hover:bg-blue-700 px-3 py-1 rounded-lg transition-colors"
              >
                Limpar
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <Table
              title="Por Campanha"
              rows={groupByCampaign(wt, spendByCampaignWT)}
              accent="bg-blue-900/50 text-blue-300"
              selectedKey={selectedCampaignWT}
              onRowClick={toggleWT}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Table
              title="Por Criativo"
              rows={groupBy(wtSub, 'utm_content')}
              accent="bg-purple-900/50 text-purple-300"
            />
            <Table
              title="Por Conjunto de Anuncio"
              rows={groupBy(wtSub, 'utm_medium')}
              accent="bg-green-900/50 text-green-300"
            />
            <Table
              title="Por Placement"
              rows={groupBy(wtSub, 'utm_campaign')}
              accent="bg-pink-900/50 text-pink-300"
            />
          </div>
        </div>
      )}

      {tab === 'checklist' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Vendas (diretas + bumps)</p>
              <p className="text-2xl font-bold text-orange-400">{checklist.length}</p>
              <p className="text-[11px] text-slate-500 mt-1">{clDirect} diretas · {checklist.length - clDirect} bumps</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Faturamento</p>
              <p className="text-2xl font-bold text-orange-400">{formatBRL(clRevenue)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Ticket {checklist.length > 0 ? formatBRL(clRevenue / checklist.length) : '—'}</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Investido</p>
              <p className="text-2xl font-bold text-rose-400">{formatBRL(totalSpendCL)}</p>
              <p className="text-[11px] text-slate-500 mt-1">CPA {clCpa != null ? formatBRL(clCpa) : '—'}</p>
            </div>
            <div className="bg-slate-900 rounded-xl px-5 py-4">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">ROAS</p>
              <p className={`text-2xl font-bold ${clRoas != null && clRoas >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {clRoas != null ? clRoas.toFixed(2) + 'x' : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Lucro {formatBRL(clRevenue - totalSpendCL)}</p>
            </div>
          </div>

          {selectedCampaignCL && (
            <div className="flex items-center gap-3 bg-orange-900/20 border border-orange-700/40 rounded-xl px-4 py-2.5">
              <span className="text-orange-300 text-sm truncate">
                Filtrando: <strong>{selectedCampaignCL}</strong>
              </span>
              <button
                onClick={() => setSelectedCampaignCL(null)}
                className="ml-auto shrink-0 text-orange-400 hover:text-white text-xs bg-orange-800/50 hover:bg-orange-700 px-3 py-1 rounded-lg transition-colors"
              >
                Limpar
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <Table
              title="Por Campanha"
              rows={groupByCampaign(checklist, spendByCampaignCL)}
              accent="bg-orange-900/50 text-orange-300"
              selectedKey={selectedCampaignCL}
              onRowClick={toggleCL}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Table
              title="Por Criativo"
              rows={groupBy(clSub, 'utm_content')}
              accent="bg-yellow-900/50 text-yellow-300"
            />
            <Table
              title="Por Conjunto de Anuncio"
              rows={groupBy(clSub, 'utm_medium')}
              accent="bg-teal-900/50 text-teal-300"
            />
            <Table
              title="Por Placement"
              rows={groupBy(clSub, 'utm_campaign')}
              accent="bg-red-900/50 text-red-300"
            />
          </div>

        </div>
      )}
    </div>
  )
}
