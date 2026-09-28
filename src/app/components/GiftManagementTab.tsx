'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Heart, Plus, Trash2, Edit2, Wallet, ArrowUpRight, CheckCircle2, AlertCircle, Sparkles, MessageSquare, ShieldCheck, X, Check, Info, Mail, Send, Upload, Camera, Image as ImageIcon, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadImageToStorage } from '@/lib/storage-upload';
import Image from 'next/image';


/* ─── Mini componente de modal de confirmação ─────────── */
function ConfirmModal({ title, message, onConfirm, onCancel, danger = false }: {
    title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-surface border border-border-soft rounded-[2rem] w-full max-w-sm shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 ${danger ? 'bg-danger-light text-danger' : 'bg-brand-pale text-brand'}`}>
                    {danger ? <Trash2 size={24} /> : <AlertCircle size={24} />}
                </div>
                <h3 className="text-lg font-black text-text-primary tracking-tight mb-2">{title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed mb-8">{message}</p>
                <div className="flex gap-3 w-full">
                    <button onClick={onCancel} className="flex-1 py-3 border border-border-soft rounded-xl text-[10px] font-black uppercase tracking-widest text-text-muted hover:bg-bg-light transition-all outline-none focus:ring-2 focus:ring-brand/20">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all outline-none focus:ring-2 shadow-md ${danger ? 'bg-danger hover:bg-danger-dark focus:ring-danger/20' : 'bg-brand hover:bg-brand-dark focus:ring-brand/20'}`}>
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Mini Toast de notificação ──────────────────────── */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
    const styles = {
        success: 'bg-emerald-600 text-white border-emerald-500/30',
        error: 'bg-rose-600 text-white border-rose-500/30',
        info: 'bg-brand text-white border-brand/20',
    };
    const icons = { success: <Check size={16} />, error: <X size={16} />, info: <Info size={16} /> };
    return (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-xl max-w-sm w-full animate-in slide-in-from-bottom-4 fade-in ${styles[type]}`}>
            <span className="flex-shrink-0">{icons[type]}</span>
            <p className="text-xs font-bold flex-1 leading-relaxed">{message}</p>
            <button onClick={onClose} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"><X size={14} /></button>
        </div>
    );
}

interface Props {
    eventId: string;
}

export default function GiftManagementTab({ eventId }: Props) {
    const router = useRouter();
    const [gifts, setGifts] = useState<any[]>([]);
    const [stats, setStats] = useState({ totalNet: 0, pendingNet: 0, availableNet: 0 });
    const [settings, setSettings] = useState<any>({ giftListEnabled: false, taxPayer: 'COUPLE', slug: '' });
    const [transactions, setTransactions] = useState<any[]>([]);
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [importing, setImporting] = useState(false);
    const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [thankingTx, setThankingTx] = useState<any>(null);
    const [thankMessage, setThankMessage] = useState('');
    const [sendingThanks, setSendingThanks] = useState(false);
    const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
    const [editingGift, setEditingGift] = useState<any>(null);
    const [savingGift, setSavingGift] = useState(false);
    const [thankedIds, setThankedIds] = useState<string[]>([]);
    const [dismissedRejectionIds, setDismissedRejectionIds] = useState<string[]>([]);
    const [uploadingImage, setUploadingImage] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && eventId) {
            const savedThanks = localStorage.getItem(`thanked_tx_${eventId}`);
            if (savedThanks) setThankedIds(JSON.parse(savedThanks));

            const savedRejections = localStorage.getItem(`dismissed_rejections_${eventId}`);
            if (savedRejections) setDismissedRejectionIds(JSON.parse(savedRejections));
        }
    }, [eventId]);

    const handleDismissRejection = (id: string) => {
        const newList = [...dismissedRejectionIds, id];
        setDismissedRejectionIds(newList);
        localStorage.setItem(`dismissed_rejections_${eventId}`, JSON.stringify(newList));
    };

    const activeRejectionToNotify = withdrawals?.find(w => 
        String(w.status || '').toUpperCase() === 'REJECTED' && 
        !dismissedRejectionIds.includes(w.id)
    );

    // Modal & Toast state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
    }, []);

    const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, danger = false) => {
        setConfirmModal({ title, message, onConfirm, danger });
    }, []);

    // 🔔 Debounce ref para evitar loops de fetch no Realtime
    const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const debouncedFetchData = useCallback(() => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = setTimeout(() => {
            fetchData();
        }, 2000);
    }, [eventId]);

    useEffect(() => {
        if (!eventId) return;
        fetchData();

        // 🔔 REAL-TIME: Ouvir novos presentes e atualizar saldo/lista
        const giftChannel = supabase
            .channel(`gifts-updates-${eventId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'gift_transactions', filter: `event_id=eq.${eventId}` },
                (payload: any) => {
                    console.log('🎁 Gift Change:', payload.eventType);
                    debouncedFetchData();
                    if (payload.eventType === 'UPDATE' && payload.new.status === 'APPROVED' && payload.old.status !== 'APPROVED') {
                        showToast(`Eba! Recebemos um novo presente de ${payload.new.guest_name}! 🎁`, 'success');
                    }
                    if (payload.eventType === 'INSERT' && payload.new.status === 'APPROVED') {
                        showToast(`Eba! Recebemos um novo presente de ${payload.new.guest_name}! 🎁`, 'success');
                    }
                }
            )
            .subscribe();

        // 💸 REAL-TIME: Ouvir saques e atualizar saldo/alerta
        const withdrawalChannel = supabase
            .channel(`withdrawals-updates-${eventId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'withdrawals', filter: `event_id=eq.${eventId}` },
                (payload: any) => {
                    console.log('💸 Withdrawal Change:', payload.eventType);
                    debouncedFetchData();
                    if (payload.eventType === 'UPDATE' && String(payload.new.status || '').toUpperCase() === 'REJECTED' && String(payload.old.status || '').toUpperCase() !== 'REJECTED') {
                        showToast(`Opa! Temos um aviso importante sobre seu saque. ⚠️`, 'info');
                    }
                    if (payload.eventType === 'UPDATE' && String(payload.new.status || '').toUpperCase() === 'COMPLETED' && String(payload.old.status || '').toUpperCase() !== 'COMPLETED') {
                        showToast(`Oba! Seu saque de R$ ${Number(payload.new.amount).toLocaleString('pt-BR')} acaba de ser pago! 🎉`, 'success');
                    }
                }
            )
            .subscribe();

        return () => {
            if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
            supabase.removeChannel(giftChannel);
            supabase.removeChannel(withdrawalChannel);
        };
    }, [eventId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/events/${eventId}/gifts?_t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (data && !data.error) {
                setGifts(data.gifts || []);
                setStats(data.stats || { totalNet: 0, pendingNet: 0, availableNet: 0 });
                setSettings(data.settings || { giftListEnabled: false, taxPayer: 'COUPLE', slug: '' });
                setTransactions(data.transactions || []);
                setWithdrawals(data.withdrawals || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSettings(true);
        try {
            const res = await fetch(`/api/events/${eventId}/gift-settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Configurações salvas com sucesso!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Erro ao salvar configurações.', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const handleImportTemplate = (category: string) => {
        const label = category === 'CASA' ? 'Produtos p/ Casa' : 'Lua de Mel Simples';
        showConfirm(
            'Importar Modelos',
            `Deseja importar a lista de "${label}"? Os itens serão adicionados à sua lista atual.`,
            async () => {
                setConfirmModal(null);
                setImporting(true);
                try {
                    const res = await fetch(`/api/events/${eventId}/gifts/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ category })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(`${data.count} presentes importados com sucesso! 🎁`, 'success');
                        fetchData();
                    } else {
                        showToast(`Erro ao importar: ${data.error || 'Erro desconhecido'}`, 'error');
                    }
                } catch (e: any) {
                    showToast(`Erro interno: ${e?.message || e}`, 'error');
                } finally {
                    setImporting(false);
                }
            }
        );
    };

    const handleOpenLibrary = () => {
        // Redireciona para a nova página de biblioteca com o eventId
        router.push(`/dashboard/presentes/biblioteca?eventId=${eventId}`);
    };

    const handleDeleteGift = (id: string) => {
        showConfirm(
            'Excluir Presente',
            'Tem certeza que deseja remover este item da lista? Esta ação não pode ser desfeita.',
            async () => {
                setConfirmModal(null);
                try {
                    const res = await fetch(`/api/events/${eventId}/gifts/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        setGifts(prev => prev.filter(g => g.id !== id));
                        showToast('Presente removido da lista.', 'info');
                    } else {
                        showToast('Erro ao excluir o presente.', 'error');
                    }
                } catch (error) {
                    showToast('Erro ao excluir o presente.', 'error');
                }
            },
            true // danger
        );
    };

    const handleRequestWithdrawal = () => {
        if (!settings.bankPixKey) {
            showToast('Por favor, configure sua chave Pix antes de solicitar o saque.', 'error');
            return;
        }

        showConfirm(
            'Solicitar Resgate',
            `Deseja solicitar o saque de R$ ${Number(stats.availableNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para a chave Pix cadastrada?`,
            async () => {
                setConfirmModal(null);
                setRequestingWithdrawal(true);
                try {
                    const res = await fetch(`/api/events/${eventId}/withdrawals`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            amount: stats.availableNet,
                            pixKey: settings.bankPixKey,
                            pixType: settings.bankType,
                            beneficiary: settings.bankBeneficiary
                        })
                    });

                    if (res.ok) {
                        showToast('Solicitação de saque enviada com sucesso! 🚀', 'success');
                        fetchData(); // Atualiza o saldo
                    } else {
                        const data = await res.json();
                        showToast(data.error || 'Erro ao solicitar saque.', 'error');
                    }
                } catch (error) {
                    showToast('Erro ao processar solicitação de saque.', 'error');
                } finally {
                    setRequestingWithdrawal(false);
                }
            }
        );
    };

    const handleSendThankYouEmail = async () => {
        if (!thankingTx || !thankingTx.guestEmail) return;
        setSendingThanks(true);
        try {
            const res = await fetch(`/api/send-thank-you-email`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    guestEmail: thankingTx.guestEmail,
                    guestName: thankingTx.guestName,
                    coupleNames: settings.coupleNames || 'Os Noivos',
                    customMessage: thankMessage,
                    amount: thankingTx.amountNet
                })
            });

            if (res.ok) {
                showToast(`E-mail de agradecimento enviado para ${thankingTx.guestName}!`, 'success');
                const newThankedIds = [...thankedIds, thankingTx.id];
                setThankedIds(newThankedIds);
                localStorage.setItem(`thanked_tx_${eventId}`, JSON.stringify(newThankedIds));
                setThankingTx(null);
                setThankMessage('');
            } else {
                const data = await res.json();
                showToast(data.error || 'Erro ao enviar e-mail.', 'error');
            }
        } catch (error) {
            showToast('Erro interno ao enviar e-mail.', 'error');
        } finally {
            setSendingThanks(false);
        }
    };

    const handleOpenAddGift = () => {
        setEditingGift({
            name: '',
            description: '',
            price: 100,
            quantity: 1,
            imageUrl: '',
            category: 'CASA',
            active: true
        });
        setIsGiftModalOpen(true);
    };

    const handleOpenEditGift = (gift: any) => {
        setEditingGift({
            id: gift.id,
            name: gift.name,
            description: gift.description || '',
            price: Number(gift.price),
            quantity: gift.quantity ? Number(gift.quantity) : 1,
            imageUrl: gift.image_url || '',
            category: gift.category || 'CASA',
            active: gift.active !== false
        });
        setIsGiftModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamanho (5MB para uploads ao Storage)
        if (file.size > 5 * 1024 * 1024) {
            showToast('A imagem deve ter no máximo 5MB.', 'error');
            return;
        }

        setUploadingImage(true);
        try {
            // 🔥 Upload direto para o Supabase Storage
            const publicUrl = await uploadImageToStorage(file, 'gifts');
            setEditingGift({ ...editingGift, imageUrl: publicUrl });
            showToast('Imagem enviada com sucesso!', 'success');
        } catch (error: any) {
            console.error('[Gift Image Upload]', error);
            showToast(error.message || 'Erro ao enviar imagem.', 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSaveGift = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingGift(true);
        try {
            const isEdit = !!editingGift.id;
            const url = isEdit 
                ? `/api/events/${eventId}/gifts/${editingGift.id}` 
                : `/api/events/${eventId}/gifts`;
            
            const res = await fetch(url, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingGift)
            });

            if (res.ok) {
                showToast(isEdit ? 'Presente atualizado!' : 'Presente criado!', 'success');
                setIsGiftModalOpen(false);
                fetchData();
            } else {
                const data = await res.json();
                showToast(data.error || 'Erro ao salvar presente.', 'error');
            }
        } catch (error) {
            showToast('Erro ao salvar presente.', 'error');
        } finally {
            setSavingGift(false);
        }
    };

    if (loading) return <div className="p-12 text-center text-text-muted"><div className="w-8 h-8 mx-auto border-4 border-brand border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand">Carregando Tesouros...</p></div>;

    const domain = typeof window !== 'undefined' ? window.location.origin : '';
    const publicUrl = settings.slug ? `${domain}/${settings.slug}/presentes` : '';

    if (!loading && settings.giftListEnabled === false) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 bg-surface border border-border-soft rounded-[3rem] shadow-sm animate-in fade-in zoom-in-95">
                <div className="w-20 h-20 bg-bg-light rounded-full flex items-center justify-center mb-6 text-text-muted opacity-30">
                    <Heart size={40} />
                </div>
                <h3 className="text-xl font-black text-text-primary tracking-tight mb-2">Módulo Desativado</h3>
                <p className="text-sm text-text-muted text-center max-w-xs font-serif italic">
                    Este módulo foi desativado nas configurações do evento. Você não pode visualizar ou gerenciar presentes enquanto estiver desabilitado.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500 overflow-visible">
            {/* MODAIS E TOASTS */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    danger={confirmModal.danger}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}

            {/* MODAL DE ADICIONAR/EDITAR PRESENTE */}
            {isGiftModalOpen && editingGift && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-surface border border-border-soft rounded-[2rem] w-full max-w-xl shadow-2xl p-8 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto no-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-serif text-text-primary tracking-tight">
                                {editingGift.id ? 'Editar Presente' : 'Novo Presente Personalizado'}
                            </h3>
                            <button onClick={() => setIsGiftModalOpen(false)} className="opacity-50 hover:opacity-100 transition-opacity"><X size={20} /></button>
                        </div>

                        {/* AVISOS DO DESAFIO */}
                        <div className="mb-6 space-y-3">
                            <div className="p-4 bg-brand-pale border border-brand/20 rounded-2xl flex items-start gap-3">
                                <Sparkles className="shrink-0 text-brand" size={18} />
                                <p className="text-[11px] font-bold text-brand leading-relaxed">
                                    Sugerimos um valor mínimo de <span className="underline decoration-brand/30 underline-offset-4">R$ 100,00</span> para presentes personalizados. Isso garante uma melhor percepção de valor para seus convidados.
                                </p>
                            </div>
                            <div className="p-4 bg-warning-light border border-warning/20 rounded-2xl flex items-start gap-3">
                                <AlertCircle className="shrink-0 text-warning" size={18} />
                                <p className="text-[11px] font-bold text-warning leading-relaxed">
                                    Valores abaixo de <span className="underline decoration-warning/30 underline-offset-4">R$ 50,00</span> poderão ser pagos APENAS via PIX pelo convidado para otimizar as taxas.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveGift} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Nome do Presente</label>
                                    <input required type="text" value={editingGift.name} onChange={e => setEditingGift({ ...editingGift, name: e.target.value })} placeholder="Ex: Jantar em Gramado" className="w-full px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Valor Unitário (R$)</label>
                                    <input required type="number" step="0.01" value={editingGift.price} onChange={e => setEditingGift({ ...editingGift, price: e.target.value })} placeholder="100.00" className="w-full px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Quantidade / Cotas</label>
                                    <input required type="number" min="1" step="1" value={editingGift.quantity || 1} onChange={e => setEditingGift({ ...editingGift, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} placeholder="1" className="w-full px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Categoria</label>
                                    <select value={editingGift.category} onChange={e => setEditingGift({ ...editingGift, category: e.target.value })} className="w-full px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-xs font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner">
                                        <option value="CASA">Casa e Cozinha</option>
                                        <option value="LUA_DE_MEL">Lua de Mel</option>
                                        <option value="OUTROS">Outros</option>
                                    </select>
                                </div>
                                {editingGift.quantity && Number(editingGift.quantity) > 1 && (
                                    <div className="md:col-span-2 p-3 bg-brand/5 border border-brand/20 rounded-xl flex items-center justify-between text-xs">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-brand">Total Consolidado ({editingGift.quantity} cotas):</span>
                                        <span className="font-black text-brand text-sm">
                                            R$ {(Number(editingGift.price || 0) * Number(editingGift.quantity)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Foto do Presente</label>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Upload de Arquivo */}
                                        <div className="relative group">
                                            <input 
                                                type="file" 
                                                id="gift-image-upload" 
                                                className="hidden" 
                                                accept="image/*" 
                                                onChange={handleImageUpload} 
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => document.getElementById('gift-image-upload')?.click()}
                                                disabled={uploadingImage}
                                                className="w-full h-full min-h-[100px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-soft rounded-2xl bg-bg-light hover:bg-white hover:border-brand/40 transition-all group-hover:shadow-md disabled:opacity-50"
                                            >
                                                {uploadingImage ? (
                                                    <span className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                                                ) : editingGift.imageUrl && editingGift.imageUrl.startsWith('data:') ? (
                                                    <>
                                                        <CheckCircle2 className="text-emerald-500" size={24} />
                                                        <span className="text-[10px] font-bold text-text-muted">Trocar Foto Carregada</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                                                            <Upload className="text-brand" size={20} />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Subir foto do dispositivo</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* Link Manual */}
                                        <div className="flex flex-col justify-between gap-3">
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={editingGift.imageUrl && !editingGift.imageUrl.startsWith('data:') ? editingGift.imageUrl : ''} 
                                                    onChange={e => setEditingGift({ ...editingGift, imageUrl: e.target.value })} 
                                                    placeholder="Ou cole o Link (URL) aqui..." 
                                                    className="w-full px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-[10px] font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" 
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                                                    <ImageIcon size={14} />
                                                </div>
                                            </div>
                                            
                                            {/* Preview Pequeno */}
                                            {editingGift.imageUrl && (
                                                <div className="p-2 bg-white border border-border-soft rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-bg-light flex-shrink-0 relative">
                                                        <Image 
                                                            src={editingGift.imageUrl} 
                                                            alt="Preview" 
                                                            fill 
                                                            className="object-cover" 
                                                        />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <p className="text-[9px] font-black uppercase text-text-muted truncate">Pré-visualização</p>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setEditingGift({ ...editingGift, imageUrl: '' })}
                                                            className="text-[9px] font-bold text-danger hover:underline mt-0.5"
                                                        >
                                                            Remover Imagem
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Breve Descrição</label>
                                    <textarea value={editingGift.description} onChange={e => setEditingGift({ ...editingGift, description: e.target.value })} placeholder="Conte um pouco sobre este presente..." className="w-full h-20 px-4 py-3 bg-bg-light border border-border-soft rounded-xl text-sm font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all resize-none shadow-inner" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border-soft">
                                <button type="button" onClick={() => setIsGiftModalOpen(false)} className="px-6 py-3 border border-border-soft rounded-xl text-[10px] font-black uppercase tracking-widest text-text-muted hover:bg-bg-light transition-all outline-none">
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingGift}
                                    className="px-8 py-3 bg-brand text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-dark transition-all flex items-center gap-2 outline-none disabled:opacity-50"
                                >
                                    {savingGift ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                                    {editingGift.id ? 'Salvar Alterações' : 'Criar Presente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DE AGRADECIMENTO */}
            {thankingTx && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-surface border border-border-soft rounded-[2rem] w-full max-w-lg shadow-2xl p-8 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-serif text-text-primary tracking-tight">E-mail de Agradecimento</h3>
                            <button onClick={() => setThankingTx(null)} className="opacity-50 hover:opacity-100 transition-opacity"><X size={20} /></button>
                        </div>

                        <div className="mb-6 p-4 bg-bg-light border border-border-soft rounded-2xl">
                            <p className="text-xs font-bold text-text-secondary">Para: <span className="text-text-primary">{thankingTx.guestName}</span> ({thankingTx.guestEmail || 'Sem e-mail cadastrado'})</p>
                            <p className="text-xs font-bold text-text-secondary mt-1">Presente: <span className="text-brand">R$ {Number(thankingTx.amountNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                            {thankingTx.message && (
                                <div className="mt-3 p-3 bg-white border-l-2 border-brand text-[11px] italic text-text-muted rounded-r-xl">
                                    "{thankingTx.message}"
                                </div>
                            )}
                        </div>

                        {!thankingTx.guestEmail ? (
                            <div className="text-center p-4 bg-warning-light text-warning-dark rounded-xl mb-6 text-sm">
                                Este convidado não cadastrou e-mail na hora da compra. Não é possível enviar o agradecimento por aqui.
                            </div>
                        ) : (
                            <div className="mb-6">
                                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Sua mensagem personalizada</label>
                                <textarea
                                    value={thankMessage}
                                    onChange={e => setThankMessage(e.target.value)}
                                    placeholder="Escreva algo especial para agradecer o presente..."
                                    className="w-full h-32 px-4 py-3 bg-surface border border-border-soft rounded-xl text-sm font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all resize-none shadow-inner"
                                />
                                <p className="text-[10px] text-text-muted mt-2 px-1">Seu nome ({settings.coupleNames}) e a nossa saudação padrão já estarão no e-mail.</p>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-8">
                            <button onClick={() => setThankingTx(null)} disabled={sendingThanks} className="px-6 py-3 border border-border-soft rounded-xl text-[10px] font-black uppercase tracking-widest text-text-muted hover:bg-bg-light transition-all outline-none">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSendThankYouEmail}
                                disabled={sendingThanks || !thankingTx.guestEmail}
                                className="px-6 py-3 bg-brand text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-brand-dark transition-all flex items-center gap-2 outline-none disabled:opacity-50 disabled:grayscale"
                            >
                                {sendingThanks ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={14} />}
                                Enviar E-mail
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE SAQUE RECUSADO (POPUP) */}
            {activeRejectionToNotify && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white border border-border-soft rounded-[2.5rem] p-10 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.3)] scale-100 animate-in zoom-in-95 duration-300 flex flex-col items-center text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-danger" />
                        
                        <div className="w-16 h-16 rounded-full bg-danger-light text-danger flex items-center justify-center mb-6 shadow-sm">
                            <AlertCircle size={32} />
                        </div>

                        <h3 className="text-2xl font-serif text-text-primary tracking-tight mb-3">
                            Aviso Importante
                        </h3>
                        
                        <p className="text-sm font-bold text-text-muted leading-relaxed mb-6 px-2">
                            Seu último pedido de saque de <span className="text-danger">R$ {Number(activeRejectionToNotify.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> não pôde ser processado por nossa auditoria.
                        </p>

                        <div className="w-full bg-bg-light border border-border-soft rounded-2xl p-5 mb-8 text-left">
                            <p className="text-[10px] uppercase font-black text-text-muted mb-2 tracking-widest">Motivo da Recusa:</p>
                            <p className="text-xs text-text-primary italic font-serif leading-relaxed">"{activeRejectionToNotify.rejectionReason || 'Dados divergentes ou chave Pix inválida.'}"</p>
                        </div>

                        <div className="w-full space-y-3 px-2 mb-8 text-left">
                            <p className="text-[9px] font-black text-text-muted/60 uppercase tracking-[0.2em] leading-normal">
                                O valor foi devolvido ao seu saldo disponível. Por favor, revise seus dados e solicite o resgate novamente.
                            </p>
                        </div>

                        <button 
                            onClick={() => handleDismissRejection(activeRejectionToNotify.id)}
                            className="w-full py-4 bg-brand hover:bg-brand-dark text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 outline-none"
                        >
                            Entendi, vou revisar
                        </button>

                        <button 
                            onClick={() => handleDismissRejection(activeRejectionToNotify.id)}
                            className="mt-4 text-[9px] font-black uppercase tracking-widest text-text-muted/40 hover:text-text-muted transition-colors"
                        >
                            Fechar (não mostrar mais)
                        </button>
                    </div>
                </div>
            )}

            {/* CABEÇALHO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-serif text-text-primary">Tesouraria dos Noivos</h2>
                    <p className="text-sm text-text-muted mt-1 font-serif italic">Receba dinheiro vivo direto na conta para realizar seus sonhos.</p>
                </div>
                {settings.giftListEnabled && settings.slug && (
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 bg-brand-pale border border-brand/20 rounded-full text-[10px] font-black uppercase tracking-widest text-brand hover:bg-brand hover:text-white shadow-sm transition-all focus:ring-2 focus:ring-brand/20 outline-none">
                        <ArrowUpRight size={14} /> Vitrine Pública
                    </a>
                )}
            </div>

            {/* CARDS DE SALDO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface rounded-[2rem] p-8 border border-border-soft shadow-sm relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 p-8 text-black/5 opacity-50 group-hover:scale-110 transition-transform"><Wallet size={120} /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-info" /> Saldo Total Recebido</p>
                        <h3 className="text-4xl font-light text-text-primary">R$ {Number(stats.totalNet || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        <p className="text-[10px] font-bold text-text-muted mt-2 italic">* Valor já descontado as taxas.</p>
                    </div>
                </div>

                <div className="bg-surface rounded-[2rem] p-8 border border-border-soft shadow-sm relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 p-8 text-warning/10 group-hover:scale-110 transition-transform"><CheckCircle2 size={120} /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-warning" /> Saldo Pendente (A Liberar)</p>
                        <h3 className="text-4xl font-light text-text-primary">R$ {Number(stats.pendingNet || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        <p className="text-[10px] text-warning font-bold mt-2 uppercase tracking-widest">Disponível em 1 dia útil</p>
                    </div>
                </div>

                <div className="bg-brand text-white rounded-[2rem] p-8 shadow-xl relative overflow-hidden group hover:-translate-y-1 hover:shadow-2xl transition-all">
                    <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:rotate-12 transition-transform"><Sparkles size={120} /></div>
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl opacity-50 group-hover:bg-white/20 transition-all" />
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-6 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_white]" /> Saldo Disponível P/ Saque</p>
                        <h3 className="text-4xl font-black drop-shadow-md tracking-tight text-white">R$ {Number(stats.availableNet || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                        
                        {(() => {
                            const pendingW = withdrawals?.find(w => (w.status || '').toUpperCase() === 'PENDING');
                            return (
                                <>
                                    {pendingW && (
                                        <div className="mt-4 p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 text-white flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Clock size={16} className="shrink-0 text-white/90 animate-spin" />
                                                <div className="text-left truncate">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-white/80">Saque em Análise</p>
                                                    <p className="text-xs font-bold text-white truncate">
                                                        R$ {Number(pendingW.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsHistoryModalOpen(true)}
                                                className="shrink-0 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[9px] font-black uppercase tracking-wider text-white transition-colors"
                                            >
                                                Ver
                                            </button>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleRequestWithdrawal}
                                        disabled={Number(stats.availableNet) <= 0 || requestingWithdrawal || !!pendingW}
                                        className="mt-6 px-6 py-3 w-full bg-white text-brand rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-pale active:scale-95 transition-all outline-none focus:ring-4 focus:ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {requestingWithdrawal ? 'Processando...' : pendingW ? 'Saque em Processamento' : 'Solicitar Resgate via Pix'}
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LISTA E IMPORTAÇÃO (COL 1 e 2) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-surface rounded-[2rem] p-8 border border-border-soft shadow-sm">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-soft">
                            <h3 className="text-2xl font-serif text-text-primary tracking-tight">Nossa Lista de Presentes</h3>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleOpenLibrary}
                                    className="flex items-center gap-2 px-4 py-2 bg-brand-pale border border-brand/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand hover:bg-brand hover:text-white transition-all"
                                >
                                    <Sparkles size={14} /> Explorar Biblioteca
                                </button>
                                {gifts.length > 0 && <button onClick={handleOpenAddGift} className="w-10 h-10 rounded-xl bg-bg-light text-brand flex items-center justify-center hover:bg-brand hover:text-white transition-all shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/20"><Plus size={18} /></button>}
                            </div>
                        </div>

                        {gifts.length === 0 ? (
                            <div className="text-center py-16 px-4 bg-bg-light rounded-[2rem] border border-dashed border-border-soft">
                                <div className="w-20 h-20 bg-brand-pale shadow-inner border border-brand/10 rounded-full flex items-center justify-center mx-auto mb-6 text-brand">
                                    <Heart size={32} />
                                </div>
                                <h4 className="text-lg font-black tracking-tight text-text-primary mb-2">Sua lista está vazia!</h4>
                                <p className="text-xs text-text-muted font-bold leading-relaxed mb-8 max-w-sm mx-auto">Adicione itens manualmente ou importe modelos fantásticos com um só clique.</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
                                    <button onClick={handleOpenLibrary} className="sm:col-span-2 p-6 bg-brand text-white border border-brand rounded-2xl flex flex-col items-center hover:bg-brand-dark hover:shadow-xl transition-all outline-none focus:ring-2 focus:ring-brand/20 group">
                                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                            <Sparkles size={24} />
                                        </div>
                                        <span className="text-[11px] font-black uppercase tracking-widest">Explorar Biblioteca de Presentes</span>
                                        <span className="text-[9px] opacity-70 mt-1 font-bold">Centenas de modelos prontos estilo iCasei</span>
                                    </button>
                                    <div className="sm:col-span-2 flex items-center gap-4 my-2">
                                        <div className="flex-1 h-px bg-border-soft" />
                                        <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Ou crie um do zero</span>
                                        <div className="flex-1 h-px bg-border-soft" />
                                    </div>
                                    <button onClick={handleOpenAddGift} className="p-4 bg-surface border border-border-soft rounded-2xl flex flex-col items-center hover:border-brand/40 hover:shadow-lg transition-all outline-none focus:ring-2 focus:ring-brand/20">
                                        <Plus className="text-brand mb-2" size={24} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">Novo Personalizado</span>
                                    </button>
                                    <button onClick={() => handleImportTemplate('CASA')} disabled={importing} className="p-4 bg-surface border border-border-soft rounded-2xl flex flex-col items-center hover:border-brand/40 hover:shadow-lg transition-all disabled:opacity-50 outline-none focus:ring-2 focus:ring-brand/20">
                                        <span className="text-2xl mb-2">🏠</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">Importação Rápida</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {gifts.map(gift => (
                                    <div key={gift.id} className="group flex items-center p-4 rounded-[1.5rem] border border-border-soft bg-surface hover:bg-bg-light hover:border-brand/30 hover:shadow-md transition-all gap-4">
                                        <div className="w-16 h-16 rounded-xl bg-bg-light flex items-center justify-center overflow-hidden flex-shrink-0 border border-border-soft shadow-inner relative">
                                            {gift.image_url ? (
                                                <Image 
                                                    src={gift.image_url} 
                                                    alt={gift.name} 
                                                    fill 
                                                    className="object-cover" 
                                                />
                                            ) : (
                                                <Gift className="text-text-muted" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-sm text-text-primary tracking-tight truncate">{gift.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-brand drop-shadow-sm">
                                                    R$ {Number(gift.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                {gift.quantity && Number(gift.quantity) > 1 && (
                                                    <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[9px] font-black uppercase tracking-wider">
                                                        {gift.quantity} {gift.is_quota ? 'cotas' : 'unidades'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleOpenEditGift(gift)} className="w-9 h-9 rounded-xl bg-surface border border-border-soft shadow-sm flex items-center justify-center text-text-muted hover:text-brand hover:border-brand/30 hover:bg-brand-pale transition-all"><Edit2 size={14} /></button>
                                            <button onClick={() => handleDeleteGift(gift.id)} className="w-9 h-9 rounded-xl bg-surface border border-border-soft shadow-sm flex items-center justify-center text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-light transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* HISTÓRICO DE PRESENTES E AGRADECIMENTOS */}
                    <div className="bg-surface rounded-[2rem] p-8 border border-border-soft shadow-sm mt-6">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-border-soft">
                            <h3 className="text-2xl font-serif text-text-primary tracking-tight">Histórico de Recebimentos</h3>
                        </div>

                        {transactions.length === 0 ? (
                            <div className="text-center py-12 text-text-muted">
                                <MessageSquare size={32} className="mx-auto mb-4 opacity-50" />
                                <p className="text-sm font-bold">Nenhum presente recebido ainda.</p>
                                <p className="text-xs mt-1">Quando alguém comprar algo, aparecerá aqui.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {transactions.map((tx: any) => (
                                    <div key={tx.id} className="p-5 bg-bg-light border border-border-soft rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-black text-sm text-text-primary">{tx.guestName}</h4>
                                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-white border border-border-soft text-text-secondary shrink-0">
                                                    {new Date(tx.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-brand font-black text-xs mb-3">R$ {Number(tx.amountNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>

                                            {tx.message ? (
                                                <div className="bg-surface p-3 rounded-xl border-l-2 border-brand text-xs italic text-text-muted shadow-sm">
                                                    "{tx.message}"
                                                </div>
                                            ) : (
                                                <p className="text-xs text-text-muted italic opacity-60">Nenhuma mensagem deixada.</p>
                                            )}
                                        </div>
                                        <div className="shrink-0 w-full md:w-auto flex flex-col items-end gap-2 mt-2 md:mt-0">
                                            {thankedIds.includes(tx.id) ? (
                                                <button
                                                    disabled
                                                    className="w-full md:w-auto px-4 py-2 bg-success/10 text-success rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 outline-none disabled:opacity-80"
                                                >
                                                    <Check size={14} /> Agradecido
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setThankingTx(tx);
                                                        setThankMessage('');
                                                    }}
                                                    className="w-full md:w-auto px-4 py-2 bg-brand-pale text-brand rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-brand hover:text-white transition-all flex items-center justify-center gap-2 outline-none focus:ring-2 focus:ring-brand/20"
                                                >
                                                    <Mail size={14} /> Agradecer
                                                </button>
                                            )}
                                            {tx.guestEmail && <span className="text-[9px] font-bold text-text-muted italic hidden md:block">{tx.guestEmail}</span>}
                                        </div>
                                    </div>
                                ))}
                                <p className="text-center text-[10px] text-text-muted uppercase tracking-widest font-bold mt-4">Exibindo os 50 mais recentes</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* CONFIGURAÇÕES (COL 3) */}
                <div className="bg-surface rounded-[2rem] p-8 border border-border-soft shadow-sm h-fit">
                    <h3 className="text-2xl font-serif tracking-tight text-text-primary mb-6 pb-4 border-b border-border-soft">Configurações e Metas</h3>
                    <form onSubmit={handleSaveSettings} className="space-y-6">
                        <div className="flex items-center justify-between p-5 bg-bg-light shadow-inner rounded-2xl border border-border-soft">
                            <div>
                                <label className="text-xs font-black text-text-primary block tracking-tight">Ativar Lista</label>
                                <span className="text-[9px] font-black uppercase tracking-widest text-brand mt-1 block">Vitrine Pública on/off</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.giftListEnabled} onChange={e => setSettings({ ...settings, giftListEnabled: e.target.checked })} />
                                <div className="w-11 h-6 bg-border-soft peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-soft after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success"></div>
                            </label>
                        </div>



                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block flex items-center gap-2"><AlertCircle size={12} /> Taxa ({settings.serviceTax || 5.49}%)</label>
                            <select value={settings.taxPayer} onChange={e => setSettings({ ...settings, taxPayer: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border-soft rounded-xl text-xs font-bold font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner">
                                <option value="COUPLE">Desejo absorver a taxa (Recebo o valor - {settings.serviceTax || 5.49}%)</option>
                                <option value="GUEST">Repassar ao convidado (+{settings.serviceTax || 5.49}% no checkout)</option>
                            </select>
                        </div>

                        <div className="pt-6 border-t border-border-soft">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-brand mb-4 flex items-center gap-2"><ShieldCheck size={14} /> Dados Para Pix</h4>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2 block">Tipo de Chave</label>
                                    <select value={settings.bankType} onChange={e => setSettings({ ...settings, bankType: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border-soft rounded-xl text-xs font-bold font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner">
                                        <option value="CPF">CPF</option>
                                        <option value="CNPJ">CNPJ</option>
                                        <option value="EMAIL">Email</option>
                                        <option value="TELEFONE">Telefone Celular</option>
                                        <option value="ALEATORIA">Chave Aleatória</option>
                                    </select>
                                </div>
                                <div>
                                    <input type="text" placeholder="Chave Pix..." value={settings.bankPixKey || ''} onChange={e => setSettings({ ...settings, bankPixKey: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border-soft rounded-xl text-xs font-bold font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2 block">Nome Completo do Titular</label>
                                    <input type="text" placeholder="Nome do Titular..." value={settings.bankBeneficiary || ''} onChange={e => setSettings({ ...settings, bankBeneficiary: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border-soft rounded-xl text-xs font-bold font-sans text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all shadow-inner" />
                                </div>
                            </div>
                        </div>

                        <button disabled={savingSettings} type="submit" className="w-full py-4 bg-brand hover:bg-brand-dark text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center outline-none focus:ring-4 focus:ring-brand/20">
                            {savingSettings ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Salvar Configurações'}
                        </button>
                    </form>

                    {/* ACESSO AO HISTÓRICO DE SAQUES INTEGRADO NA COLUNA DE CONFIGS */}
                    {withdrawals.length > 0 && (
                        <div className="mt-8 pt-8 border-t border-border-soft space-y-4">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h3 className="text-xl font-serif tracking-tight text-text-primary">
                                        Saques
                                    </h3>
                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mt-1">
                                        Total realizado: R$ {withdrawals.filter(w => w.status === 'COMPLETED').reduce((acc, w) => acc + Number(w.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <span className="text-[10px] font-black bg-brand/10 text-brand px-2 py-1 rounded-full">{withdrawals.length} {withdrawals.length === 1 ? 'registro' : 'registros'}</span>
                            </div>
                            
                            <button 
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="w-full py-4 bg-white border-2 border-brand/20 text-brand hover:border-brand hover:bg-brand/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-4 h-4 transition-transform group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Ver Histórico de Saques
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL DE HISTÓRICO DE SAQUES DETALHADO */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-text-primary/40 backdrop-blur-md transition-opacity" onClick={() => setIsHistoryModalOpen(false)} />
                    <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
                        {/* Header do Modal */}
                        <div className="px-8 py-6 border-b border-border-soft flex justify-between items-center bg-bg-light/50">
                            <div>
                                <h2 className="text-2xl font-serif tracking-tight text-text-primary">Histórico de Saques</h2>
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">Detalhamento financeiro completo</p>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-text-muted hover:text-brand">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Conteúdo do Modal */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6 bg-white">
                            {withdrawals.length === 0 ? (
                                <div className="py-20 text-center">
                                    <div className="w-16 h-16 bg-bg-light rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    </div>
                                    <p className="text-text-muted font-bold text-sm">Nenhum saque realizado ainda.</p>
                                </div>
                            ) : (
                                withdrawals.map(w => (
                                    <div key={w.id} className="p-6 rounded-[2rem] bg-bg-light border border-border-soft flex flex-col group hover:border-brand/30 transition-all shadow-sm">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${w.status === 'COMPLETED' ? 'bg-success/10 text-success' : w.status === 'REJECTED' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={w.status === 'COMPLETED' ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : w.status === 'REJECTED' ? "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"} />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">
                                                        {new Date(w.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-text-muted uppercase mt-1 flex flex-wrap gap-3 items-center">
                                                        <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> PIX: {w.pixKey}</span>
                                                        {w.receiptUrl && (
                                                            <a href={w.receiptUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand hover:underline font-black group/link">
                                                                <svg className="w-3 h-3 transition-transform group-hover/link:-rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                                BAIXAR COMPROVANTE
                                                            </a>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 border-border-soft pt-4 sm:pt-0">
                                                <p className="font-black text-brand text-xl">R$ {Number(w.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 inline-block shadow-sm ${w.status === 'COMPLETED' ? 'bg-success-light text-success-dark border-success/20' :
                                                    w.status === 'REJECTED' ? 'bg-danger-light text-danger-dark border-danger/20' :
                                                        'bg-warning-light text-warning-dark border-warning/20'
                                                    }`}>
                                                    {w.status === 'COMPLETED' ? 'Saque Pago' : w.status === 'REJECTED' ? 'Saque Recusado' : 'Aguardando Pagamento'}
                                                </span>
                                            </div>
                                        </div>

                                        {w.status === 'REJECTED' && w.rejectionReason && (
                                            <div className="mt-6 p-4 bg-danger/5 border border-danger/10 rounded-[1.5rem] flex gap-3">
                                                <div className="text-danger shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-danger mb-1">Motivo da Recusa pela Auditoria</p>
                                                    <p className="text-xs text-text-secondary leading-relaxed font-bold italic">"{w.rejectionReason}"</p>
                                                </div>
                                            </div>
                                        )}

                                        {w.status !== 'REJECTED' && w.gifts && w.gifts.length > 0 && (
                                            <div className="mt-6 pt-6 border-t border-border-soft w-full">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                                    Composição deste Saque
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {w.gifts.map((g: any) => (
                                                        <div key={g.id} className="flex flex-col bg-bg-light px-4 py-3 rounded-2xl border border-border-soft hover:shadow-md transition-shadow">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold text-text-primary truncate">{g.guestName}</span>
                                                                <span className="text-xs font-black text-brand">R$ {Number(g.amountNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </div>
                                                            <p className="text-[8px] font-bold text-text-muted uppercase tracking-tighter mt-1 flex justify-between">
                                                                <span>Bruto: R$ {Number(g.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                <span>Taxa: R$ {Math.abs(g.amount - g.amountNet).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-6 bg-white/60 p-5 rounded-[2rem] border border-brand/10 shadow-inner">
                                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">Resumo Financeiro Consolidado</p>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between text-xs font-bold text-text-secondary">
                                                            <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Total Bruto Recebido:</span>
                                                            <span>R$ {w.gifts.reduce((acc: number, g: any) => acc + (g.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs font-bold text-danger/80">
                                                            <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg> Taxas de Intermediação:</span>
                                                            <span>- R$ {w.gifts.reduce((acc: number, g: any) => acc + ((g.amount || 0) - (g.amountNet || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="flex justify-between text-base font-black text-success border-t border-border-soft pt-3 mt-3">
                                                            <span>VALOR LÍQUIDO PAGO:</span>
                                                            <span>R$ {Number(w.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
