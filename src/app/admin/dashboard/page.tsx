'use client'

import { SharedLayout } from '@/app/components/shared-layout'
import { ProtectedRoute } from '@/lib/protected-route'
import { useAuth } from '@/lib/auth-context'
import { useAdmin } from '@/lib/admin-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/confirm-dialog'

function AdminDashboardContent() {
  const { user } = useAuth()
  const { events, getTotalMetrics, removeEvent, metrics, fetchMetrics, loading: adminLoading } = useAdmin()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [guestCounts, setGuestCounts] = useState<Record<string, any>>({})
  const [giftTotals, setGiftTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [deleteEventDialog, setDeleteEventDialog] = useState<{ isOpen: boolean; id?: string; name?: string }>({ isOpen: false })

  // Carregar contagens de convidados para cada evento
  useEffect(() => {
    if (events.length === 0) return

    async function fetchCounts() {
      setLoading(true)
      const counts: Record<string, any> = {}

      try {
        const { data, error } = await supabase
          .from('guests')
          .select('event_id, status, companions_list')

        if (error) throw error

        data.forEach(g => {
          if (!counts[g.event_id]) {
            counts[g.event_id] = { total: 0, confirmed: 0, pending: 0 }
          }
          const cCount = 1 + (g.companions_list?.length || 0)
          counts[g.event_id].total += cCount

          if (g.status === 'confirmed') {
            const confirmedCompanions = g.companions_list?.filter((c: any) => c.isConfirmed).length || 0
            counts[g.event_id].confirmed += 1 + confirmedCompanions
          } else if (g.status === 'pending') {
            const pendingCompanions = g.companions_list?.filter((c: any) => !c.isConfirmed).length || 0
            counts[g.event_id].pending += 1 + pendingCompanions
          }
        })
        setGuestCounts(counts)
      } catch (err) {
        console.error('Erro ao carregar contagens:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCounts()
  }, [events])

  // Carregar totais de presentes por evento
  useEffect(() => {
    if (events.length === 0) return
    async function fetchGiftTotals() {
      try {
        const { data, error } = await supabase
          .from('gift_transactions')
          .select('event_id, amount_net')
          .eq('status', 'APPROVED')

        if (error) throw error

        const totals: Record<string, number> = {}
          ; (data || []).forEach((t: any) => {
            totals[t.event_id] = (totals[t.event_id] || 0) + Number(t.amount_net)
          })
        setGiftTotals(totals)
      } catch (err) {
        console.error('Erro ao buscar totais de presentes:', err)
      }
    }
    fetchGiftTotals()
  }, [events])

  const handleDeleteEvent = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    setDeleteEventDialog({ isOpen: true, id, name })
  }

  const confirmDeleteEvent = async () => {
    if (!deleteEventDialog.id) return
    try {
      await removeEvent(deleteEventDialog.id)
      toast.success('Evento removido com sucesso.')
    } catch (err) {
      toast.error('Erro ao remover evento', { description: 'Não foi possível excluir. Tente novamente.' })
    } finally {
      setDeleteEventDialog({ isOpen: false })
    }
  }

  const filteredEvents = events.filter(event =>
    event.eventSettings.coupleNames.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <SharedLayout
      role="admin"
      title="Painel Administrativo"
      subtitle="Visão geral de todos os eventos"
      headerActions={
        <>
          <button
            onClick={() => router.push('/admin/users')}
            className="px-6 py-3 bg-white border border-border-soft rounded-2xl text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-brand hover:border-brand/20 transition-all shadow-sm flex items-center gap-2"
          >
            👥 Usuários
          </button>
          <button
            onClick={() => router.push('/admin/presentes/biblioteca')}
            className="px-6 py-3 bg-white border border-border-soft rounded-2xl text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-brand hover:border-brand/20 transition-all shadow-sm flex items-center gap-2"
          >
            📚 Biblioteca
          </button>
          <button
            onClick={() => router.push('/admin/withdrawals')}
            className="px-6 py-3 bg-white border border-border-soft rounded-2xl text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-brand hover:border-brand/20 transition-all shadow-sm flex items-center gap-2"
          >
            💰 Saques
          </button>
          <button
            onClick={() => router.push('/admin/reports')}
            className="px-6 py-3 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 hover:bg-brand/90 hover:-translate-y-1 transition-all flex items-center gap-2"
          >
            📊 Relatórios
          </button>
        </>
      }
    >
      {/* ── SEÇÃO DE EXCEÇÕES (BADGES CRÍTICOS) ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Saques Pendentes */}
        <div 
          onClick={() => router.push('/admin/withdrawals')}
          className={`p-6 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${(metrics?.pendingWithdrawals ?? 0) > 0 ? 'bg-danger/5 border-danger/20 hover:bg-danger/10' : 'bg-surface border-border-soft opacity-60'}`}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Saques Pendentes</p>
            <h4 className={`text-2xl font-black ${(metrics?.pendingWithdrawals ?? 0) > 0 ? 'text-danger' : 'text-text-primary'}`}>
              {metrics?.pendingWithdrawals || 0}
            </h4>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 ${(metrics?.pendingWithdrawals ?? 0) > 0 ? 'bg-danger text-white shadow-lg shadow-danger/20' : 'bg-bg-light text-text-muted'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
        </div>

        {/* Novos Usuários (24h) */}
        <div 
          onClick={() => router.push('/admin/users')}
          className={`p-6 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${(metrics?.newUsers ?? 0) > 0 ? 'bg-brand/5 border-brand/20 hover:bg-brand/10' : 'bg-surface border-border-soft opacity-60'}`}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Novos Usuários (24h)</p>
            <h4 className={`text-2xl font-black ${(metrics?.newUsers ?? 0) > 0 ? 'text-brand' : 'text-text-primary'}`}>
              +{metrics?.newUsers || 0}
            </h4>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 ${(metrics?.newUsers ?? 0) > 0 ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'bg-bg-light text-text-muted'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
        </div>

        {/* Eventos Próximos */}
        <div className="p-6 bg-surface border border-border-soft rounded-[2rem] flex items-center justify-between group opacity-90 hover:opacity-100 transition-all">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Eventos (Hoje/Amanhã)</p>
            <h4 className="text-2xl font-black text-text-primary">{metrics?.upcomingEvents || 0}</h4>
          </div>
          <div className="w-12 h-12 bg-bg-light text-text-muted rounded-2xl flex items-center justify-center transition-all group-hover:scale-110">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          </div>
        </div>

        {/* Alertas de Anomalia */}
        <div className={`p-6 rounded-[2rem] border transition-all flex items-center justify-between group ${(metrics?.anomalies?.length ?? 0) > 0 ? 'bg-warning border-warning/30 animate-pulse' : 'bg-surface border-border-soft opacity-60'}`}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Detecção de Riscos</p>
            <h4 className={`text-2xl font-black ${(metrics?.anomalies?.length ?? 0) > 0 ? 'text-text-primary' : 'text-text-primary'}`}>
              {(metrics?.anomalies?.length ?? 0) > 0 ? 'ALERTA' : 'OK'}
            </h4>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 ${(metrics?.anomalies?.length ?? 0) > 0 ? 'bg-white text-warning shadow-lg' : 'bg-bg-light text-text-muted'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
        </div>
      </div>

      {/* ── TORRE DE CONTROLE: VOLUME GLOBAL ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2 bg-gradient-to-br from-brand-dark to-[#5C1D0B] rounded-[3rem] p-8 md:p-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">Torre de Controle</h3>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Volume Transacional (7 dias)</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
                <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[8px] font-black text-white uppercase tracking-widest">Live Monitor</span>
              </div>
            </div>

            {/* Simple SVG Chart */}
            <div className="h-48 flex items-end gap-2 md:gap-4 mb-4">
              {metrics?.transactionHistory?.map((day: any, i: number) => {
                const max = Math.max(...metrics.transactionHistory.map((d: any) => d.total), 1);
                const height = (day.total / max) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-3 group/bar">
                    <div className="relative w-full h-full flex items-end">
                      <div 
                        className="w-full bg-brand-light/40 group-hover/bar:bg-white transition-all duration-500 rounded-t-xl relative border-t border-white/20"
                        style={{ height: `${Math.max(height, 5)}%` }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white text-brand-dark text-[9px] font-black px-2 py-1 rounded-md opacity-0 group-hover/bar:opacity-100 transition-opacity shadow-2xl pointer-events-none whitespace-nowrap z-20">
                          R$ {day.total.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-tighter">
                      {new Date(day.date).toLocaleDateString('pt-BR', { weekday: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border-soft rounded-[3rem] p-10 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-brand/10 transition-all" />
          
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 bg-brand rounded-full" />
              <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em]">Master Revenue</p>
            </div>
            <h3 className="text-4xl font-black text-text-primary tracking-tighter mb-2">
              R$ {metrics?.totalRevenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-60">Ganhos da Plataforma</p>
          </div>

          <div className="mt-8 pt-8 border-t border-border-soft/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Meta de Arrecadação</span>
              <span className="text-xs font-black text-brand">85%</span>
            </div>
            <div className="w-full h-2 bg-bg-light rounded-full overflow-hidden p-0.5 border border-border-soft/10">
              <div className="h-full bg-brand w-[85%] rounded-full shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-[3rem] border border-border-soft p-10 mb-12 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-pale/20 rounded-full -mr-32 -mt-32 blur-3xl transition-all group-hover:bg-brand-pale/30" />
        
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-border-soft/50">
          <div className="text-center md:px-4 pt-4 md:pt-0">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">Total de Eventos</p>
            <p className="text-4xl font-black text-text-primary tracking-tighter">{events.length}</p>
          </div>

          <div className="text-center md:px-4 pt-4 md:pt-0">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">Total Convidados</p>
            <p className="text-4xl font-black text-brand tracking-tighter">
              {Object.values(guestCounts).reduce((acc, curr) => acc + curr.total, 0)}
            </p>
          </div>

          <div className="text-center md:px-4 pt-4 md:pt-0 border-none">
            <p className="text-[10px] font-black text-success-dark uppercase tracking-[0.2em] mb-3">Confirmados</p>
            <p className="text-4xl font-black text-success-dark tracking-tighter">
              {Object.values(guestCounts).reduce((acc, curr) => acc + curr.confirmed, 0)}
            </p>
          </div>

          <div className="text-center md:px-4 pt-4 md:pt-0">
            <p className="text-[10px] font-black text-brand uppercase tracking-[0.2em] mb-3">Taxa Média</p>
            <div className="flex items-center justify-center gap-1">
              <p className="text-4xl font-black text-brand tracking-tighter">
                {Object.values(guestCounts).length > 0
                  ? Math.round((Object.values(guestCounts).reduce((acc, curr) => acc + curr.confirmed, 0) / Object.values(guestCounts).reduce((acc, curr) => acc + curr.total, 0)) * 100)
                  : 0}
              </p>
              <span className="text-xl font-bold text-brand-light/50">%</span>
            </div>
          </div>

          <div className="text-center md:px-4 pt-4 md:pt-0">
            <p className="text-[10px] font-black text-success-dark uppercase tracking-[0.2em] mb-3">💰 Total Presentes</p>
            <p className="text-2xl font-black text-success-dark tracking-tighter">
              R$ {Object.values(giftTotals).reduce((a, b) => a + b, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-[3rem] border border-border-soft overflow-hidden shadow-sm">
        <div className="p-8 md:p-12 border-b border-border-soft flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por casal ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-8 py-5 bg-bg-light border-none rounded-3xl text-sm font-bold shadow-inner outline-none focus:ring-4 focus:ring-brand/5 transition-all placeholder:text-text-muted text-text-primary"
            />
          </div>
        </div>

        <div className="p-8 md:p-12">
          {filteredEvents.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-text-muted font-serif italic text-lg">Nenhum evento encontrado...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredEvents.map(event => {
                const count = guestCounts[event.id] || { total: 0, confirmed: 0, pending: 0 }
                const rate = count.total > 0 ? Math.round((count.confirmed / count.total) * 100) : 0

                return (
                  <div key={event.id} className="bg-surface rounded-[2.5rem] p-8 border border-border-soft hover:border-brand/20 transition-all group hover:shadow-2xl hover:shadow-brand/[0.03]">
                    <div className="flex justify-between items-start mb-8">
                      <div className="w-16 h-16 bg-brand-pale rounded-2xl flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                        {event.eventSettings.eventType === 'casamento' ? '💒' : '👑'}
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <div className="text-right">
                          <p className="text-[9px] font-black text-brand uppercase tracking-widest">{rate}% Confirmado</p>
                          <p className="text-[8px] font-bold text-text-muted uppercase mt-1">{count.total} convidados</p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteEvent(e, event.id, event.eventSettings.coupleNames)}
                          className="w-8 h-8 rounded-lg bg-danger/5 text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-all border border-danger/10 group/trash"
                          title="Excluir Evento"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xl font-serif font-black text-text-primary mb-2 group-hover:text-brand transition-colors tracking-tight leading-tight">
                      {event.eventSettings.coupleNames}
                    </h3>
                    <p className="text-xs font-bold text-text-muted mb-6 uppercase tracking-widest italic">
                      {new Date(event.eventSettings.eventDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>

                    {/* Financeiro */}
                    {giftTotals[event.id] > 0 && (
                      <div className="mb-6 px-4 py-3 bg-success-light border border-success/20 rounded-2xl flex items-center justify-between">
                        <span className="text-[9px] font-black text-success-dark uppercase tracking-widest">Presentes Recebidos</span>
                        <span className="text-sm font-black text-success-dark">
                          R$ {giftTotals[event.id].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => router.push(`/admin/evento/${event.id}`)}
                      className="w-full py-4.5 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-brand/20 hover:bg-brand-dark hover:-translate-y-1 transition-all"
                    >
                      Gerenciar Evento
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteEventDialog.isOpen}
        title="Excluir Evento"
        message={`Tem certeza que deseja excluir permanentemente o evento "${deleteEventDialog.name}"? Isso removerá TODOS os convidados e dados vinculados.`}
        onConfirm={confirmDeleteEvent}
        onCancel={() => setDeleteEventDialog({ isOpen: false })}
      />
    </SharedLayout>
  )
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requireAdmin={true}>
      <AdminDashboardContent />
    </ProtectedRoute>
  )
}
