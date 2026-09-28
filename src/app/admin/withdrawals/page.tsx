'use client'

import { SharedLayout } from '@/app/components/shared-layout'
import { ProtectedRoute } from '@/lib/protected-route'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Check, X, Clock, Wallet, ArrowUpRight, Search, Filter, Plus, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/confirm-dialog'

function AdminWithdrawalsContent() {
    const [withdrawals, setWithdrawals] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'REJECTED'>('ALL')
    const [statusUpdateDialog, setStatusUpdateDialog] = useState<{ isOpen: boolean; id?: string; newStatus?: string }>({ isOpen: false })

    const [receiptFile, setReceiptFile] = useState<File | null>(null)
    const [rejectionReason, setRejectionReason] = useState('')

    useEffect(() => {
        fetchWithdrawals()

        const channel = supabase
            .channel('admin-withdrawals-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
                fetchWithdrawals()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    async function fetchWithdrawals() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('withdrawals')
                .select(`
                    *,
                    events (
                        event_settings
                    )
                `)
                .order('requested_at', { ascending: false })

            if (error) throw error
            setWithdrawals(data || [])
        } catch (err) {
            console.error('Erro ao carregar saques:', err)
        } finally {
            setLoading(false)
        }
    }

    async function handleUpdateStatus(id: string, newStatus: string) {
        setReceiptFile(null)
        setRejectionReason('')
        setStatusUpdateDialog({ isOpen: true, id, newStatus })
    }

    async function confirmUpdateStatus(force = false) {
        const { id, newStatus } = statusUpdateDialog
        if (!id || !newStatus) return
        setStatusUpdateDialog({ isOpen: false })
        setProcessingId(id)
        
        try {
            const formData = new FormData()
            formData.append('status', newStatus)
            if (force) formData.append('force', 'true')
            
            if (newStatus === 'COMPLETED' && receiptFile) {
                formData.append('receipt', receiptFile)
            }
            if (newStatus === 'REJECTED' && rejectionReason) {
                formData.append('rejection_reason', rejectionReason)
            }

            const res = await fetch(`/api/admin/withdrawals/${id}`, {
                method: 'PATCH',
                body: formData
            })

            const json = await res.json()
            if (!res.ok) {
                if (json.error === 'HIGH_VALUE_LOCKED') {
                    // Tratar bloqueio de alto valor
                    if (confirm(json.message + "\n\nDeseja forçar a aprovação como administrador mestre?")) {
                        return confirmUpdateStatus(true);
                    }
                    throw new Error('Aprovação cancelada pelo usuário.');
                }
                throw new Error(json.error || 'Erro ao processar')
            }

            setWithdrawals(prev => prev.map(w => w.id === id ? { 
                ...w, 
                status: newStatus, 
                receipt_url: json.data?.receipt_url || w.receipt_url,
                rejection_reason: json.data?.rejection_reason || w.rejection_reason,
                approved_by: json.data?.approved_by || w.approved_by
            } : w))
            
            toast.success(`Status atualizado para ${newStatus === 'COMPLETED' ? 'Pago' : 'Recusado'}.`)
        } catch (err: any) {
            toast.error('Erro ao processar', { description: err.message })
            console.error(err)
        } finally {
            setProcessingId(null)
            setReceiptFile(null)
            setRejectionReason('')
        }
    }

    const filteredWithdrawals = withdrawals.filter(w => {
        const settings = typeof w.events?.event_settings === 'string'
            ? JSON.parse(w.events.event_settings)
            : w.events?.event_settings
        const coupleNames = settings?.coupleNames?.toLowerCase() || ''
        const pixKey = w.pix_key?.toLowerCase() || ''
        const beneficiary = w.beneficiary?.toLowerCase() || ''

        const matchesSearch = coupleNames.includes(searchTerm.toLowerCase()) ||
            pixKey.includes(searchTerm.toLowerCase()) ||
            beneficiary.includes(searchTerm.toLowerCase())

        const matchesStatus = statusFilter === 'ALL' || (w.status || '').toUpperCase() === statusFilter

        return matchesSearch && matchesStatus
    })

    return (
        <SharedLayout
            role="admin"
            title="Gestão de Saques"
            subtitle="Controle financeiro e liberação de pagamentos"
        >
            <div className="space-y-8">
                {/* ── FILTROS E BUSCA ────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por casal, chave Pix ou titular..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-14 pr-8 py-5 bg-surface border border-border-soft rounded-3xl text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-brand/5 transition-all"
                        />
                    </div>
                    <div className="flex bg-surface border border-border-soft rounded-3xl p-1 gap-1 flex-wrap md:flex-nowrap">
                        {(['ALL', 'PENDING', 'COMPLETED', 'REJECTED'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === f
                                        ? 'bg-brand text-white shadow-lg'
                                        : 'text-text-muted hover:bg-bg-light'
                                    }`}
                            >
                                {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendentes' : f === 'COMPLETED' ? 'Pagos' : 'Recusados'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── LISTA DE SAQUES ─────────────────────────────────────── */}
                <div className="bg-surface rounded-[3rem] border border-border-soft overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="py-24 flex flex-col items-center justify-center gap-4">
                            <div className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand">Carregando solicitações...</p>
                        </div>
                    ) : filteredWithdrawals.length === 0 ? (
                        <div className="py-24 text-center">
                            <Wallet className="w-16 h-16 text-text-muted/20 mx-auto mb-6" />
                            <p className="text-text-muted font-serif italic text-lg text-center px-6">Nenhuma solicitação encontrada para os filtros aplicados.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-bg-light border-b border-border-soft">
                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-text-muted">Evento / Casal</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-text-muted">Valor</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-text-muted">Dados do Pix</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-text-muted text-center">Status</th>
                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-text-muted text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-soft/50">
                                    {filteredWithdrawals.map((w) => {
                                        const settings = typeof w.events?.event_settings === 'string'
                                            ? JSON.parse(w.events.event_settings)
                                            : w.events?.event_settings

                                        return (
                                            <tr key={w.id} className="group hover:bg-bg-light/30 transition-colors">
                                                <td className="px-8 py-8">
                                                    <p className="font-serif font-black text-text-primary text-base leading-tight">
                                                        {settings?.coupleNames || 'Evento sem nome'}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-text-muted mt-2 uppercase tracking-widest">
                                                        Solicitado em {new Date(w.requested_at).toLocaleDateString('pt-BR')} às {new Date(w.requested_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </td>
                                                <td className="px-8 py-8">
                                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-pale border border-brand/10 rounded-xl">
                                                        <span className="text-sm font-black text-brand tracking-tighter">
                                                            R$ {Number(w.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-8">
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-black text-text-primary">{w.pix_key}</p>
                                                        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                                                            {w.pix_type} • {w.beneficiary || 'Não informado'}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-8">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <span className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border ${(w.status || '').toUpperCase() === 'COMPLETED' ? 'bg-success-light text-success-dark border-success/20' :
                                                                (w.status || '').toUpperCase() === 'REJECTED' ? 'bg-danger-light text-danger-dark border-danger/20' :
                                                                    'bg-warning-light text-warning-dark border-warning/20 animate-pulse'
                                                            }`}>
                                                            {(w.status || '').toUpperCase() === 'COMPLETED' ? 'Pago' : (w.status || '').toUpperCase() === 'REJECTED' ? 'Recusado' : 'Pendente'}
                                                        </span>
                                                        {w.receipt_url && (
                                                            <a href={w.receipt_url} target="_blank" rel="noreferrer" className="text-[9px] font-black text-brand hover:underline">Ver Recibo</a>
                                                        )}
                                                        {w.approved_by && (
                                                            <p className="text-[8px] font-bold text-text-muted/40 uppercase tracking-tighter mt-1">Aprovado por: {w.approved_by}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-8">
                                                    <div className="flex items-center justify-end gap-3">
                                                        {(w.status || '').toUpperCase() === 'PENDING' && (
                                                            <>
                                                                <button
                                                                    disabled={processingId === w.id}
                                                                    onClick={() => handleUpdateStatus(w.id, 'COMPLETED')}
                                                                    className="w-10 h-10 bg-success text-white rounded-xl flex items-center justify-center shadow-lg shadow-success/20 hover:-translate-y-1 transition-all disabled:opacity-50"
                                                                    title="Marcar como Pago"
                                                                >
                                                                    {processingId === w.id ? <Clock size={16} className="animate-spin" /> : <Check size={18} />}
                                                                </button>
                                                                <button
                                                                    disabled={processingId === w.id}
                                                                    onClick={() => handleUpdateStatus(w.id, 'REJECTED')}
                                                                    className="w-10 h-10 bg-danger text-white rounded-xl flex items-center justify-center shadow-lg shadow-danger/20 hover:-translate-y-1 transition-all disabled:opacity-50"
                                                                    title="Recusar Saque"
                                                                >
                                                                    <X size={18} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            className="w-10 h-10 bg-bg-light text-text-muted rounded-xl flex items-center justify-center hover:bg-brand hover:text-white transition-all border border-border-soft group-hover:border-brand/20"
                                                            title="Ver detalhes do evento"
                                                            onClick={() => window.open(`/admin/evento/${w.event_id}`, '_blank')}
                                                        >
                                                            <ArrowUpRight size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="py-10 text-center">
                    <p className="text-[9px] font-black text-text-muted/40 uppercase tracking-[0.3em]">Gestão Financeira • Vanessa Bidinotti</p>
                </div>
            </div>

            {/* Modal de Processamento Padrão Sistêmico */}
            {statusUpdateDialog.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white border border-border-soft rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-300 flex flex-col items-center text-center">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 ${statusUpdateDialog.newStatus === 'COMPLETED' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}`}>
                            {statusUpdateDialog.newStatus === 'COMPLETED' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        </div>

                        <h3 className="text-xl font-serif text-text-primary tracking-tight mb-2">
                            {statusUpdateDialog.newStatus === 'COMPLETED' ? 'Confirmar Pagamento' : 'Recusar Saque'}
                        </h3>
                        
                        <div className="w-full space-y-4 mb-8 text-left">
                            {statusUpdateDialog.newStatus === 'COMPLETED' ? (
                                <div className="space-y-3">
                                    <p className="text-[11px] text-text-muted text-center font-bold leading-relaxed px-4">Anexe o comprovante de pagamento para que os noivos possam visualizar.</p>
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            id="file-upload"
                                            accept="image/*,.pdf"
                                            onChange={e => setReceiptFile(e.target.files?.[0] || null)}
                                            className="hidden" 
                                        />
                                        <label 
                                            htmlFor="file-upload"
                                            className="flex flex-col items-center justify-center w-full p-4 border border-dashed border-border-soft rounded-2xl bg-bg-light hover:border-brand/30 transition-all cursor-pointer"
                                        >
                                            <Plus size={16} className="text-brand mb-1" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted overflow-hidden text-center truncate w-full px-2">
                                                {receiptFile ? receiptFile.name : 'Víncular Recibo'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block ml-1">Motivo da Recusa</label>
                                    <textarea 
                                        placeholder="Ex: Chave PIX não encontrada..."
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        className="w-full px-4 py-3 bg-white border border-border-soft rounded-xl text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-danger/10 focus:border-danger/30 transition-all resize-none h-24 shadow-inner"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 w-full">
                            <button 
                                onClick={() => setStatusUpdateDialog({ isOpen: false })} 
                                className="flex-1 py-3.5 border border-border-soft rounded-xl text-[10px] font-black uppercase tracking-widest text-text-muted hover:bg-bg-light transition-all outline-none"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => confirmUpdateStatus(false)} 
                                disabled={processingId !== null}
                                className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-md flex justify-center items-center gap-2 ${statusUpdateDialog.newStatus === 'COMPLETED' ? 'bg-success hover:bg-success-dark' : 'bg-[#D38883] hover:bg-[#C17772]'}`}
                            >
                                {processingId ? <Clock size={16} className="animate-spin" /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SharedLayout>
    )
}

export default function AdminWithdrawalsPage() {
    return (
        <ProtectedRoute requireAdmin={true}>
            <AdminWithdrawalsContent />
        </ProtectedRoute>
    )
}
