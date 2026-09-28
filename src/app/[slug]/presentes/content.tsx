'use client'

import { useEvent } from '@/lib/event-context'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { SUBCATEGORY_NAMES } from '@/lib/gift-templates'
import Image from 'next/image'

interface Props { slug: string }

export default function PresentsContent({ slug }: Props) {
    const { eventSettings, loading: contextLoading } = useEvent()
    const [gifts, setGifts] = useState<any[]>([])
    const [taxPayer, setTaxPayer] = useState('COUPLE')
    const [serviceTax, setServiceTax] = useState(5.49)
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<any | null>(null)
    const [cart, setCart] = useState<any[]>([])
    const [isCartOpen, setIsCartOpen] = useState(false)

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [eventId, setEventId] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<'STRIPE' | 'PIX_MP' | 'INFINITEPAY'>('INFINITEPAY')
    const [qrCodeData, setQrCodeData] = useState<{qrCode: string, qrCodeBase64: string} | null>(null)
    const [pendingTx, setPendingTx] = useState<{ id: string; giftIds: string[] } | null>(null)
    const pollingRef = useRef<NodeJS.Timeout | null>(null)

    const isCorrectEvent = eventSettings.slug === slug

    useEffect(() => {
        if (!isCorrectEvent) return
        fetch(`/api/events/by-slug/${slug}/gifts`)
            .then(r => r.json())
            .then(d => {
                setGifts(d.gifts || [])
                if (d.eventId) setEventId(d.eventId)
                if (d.settings?.taxPayer) setTaxPayer(d.settings.taxPayer)
                if (d.settings?.serviceTax) setServiceTax(Number(d.settings.serviceTax))
            })
            .finally(() => setLoading(false))

        // Carregar carrinho do localStorage ao iniciar
        const savedCart = localStorage.getItem(`cart_${slug}`);
        if (savedCart) {
            try {
                setCart(JSON.parse(savedCart));
            } catch (e) {
                console.error("Erro ao carregar carrinho:", e);
            }
        }
    }, [slug, isCorrectEvent])

    // Salvar carrinho sempre que ele mudar
    useEffect(() => {
        if (isCorrectEvent && cart.length > 0) {
            localStorage.setItem(`cart_${slug}`, JSON.stringify(cart));
        } else if (isCorrectEvent && cart.length === 0) {
            localStorage.removeItem(`cart_${slug}`);
        }
    }, [cart, slug, isCorrectEvent]);

    // Reseta estados auxiliares ao fechar modal ou limpar seleção
    useEffect(() => {
        if (!isCartOpen && !selected) {
            setQrCodeData(null);
            if (pollingRef.current) clearInterval(pollingRef.current);
        }
    }, [selected, isCartOpen]);

    const getDisplayPrice = (price: any) => {
        const val = Number(price);
        const feeMultiplier = 1 + (serviceTax / 100);
        return taxPayer === 'GUEST' ? val * feeMultiplier : val;
    };

    const formatPrice = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
    };

    const groupedGifts = useMemo(() => {
        const groups: { [key: string]: any[] } = {}
        gifts.forEach(gift => {
            const sub = gift.subcategory || 'Outros'
            if (!groups[sub]) groups[sub] = []
            groups[sub].push(gift)
        })
        return groups
    }, [gifts])

    const startPolling = useCallback((transactionId: string) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                // Usamos o ID da primeira transação para checar (já que todas as do grupo atualizam juntas)
                const res = await fetch(`/api/gift/verify?t=${transactionId}`);
                const data = await res.json();
                if (data.status === 'APPROVED') {
                    clearInterval(pollingRef.current!);
                    window.location.href = `/${slug}/presentes/sucesso?t=${transactionId}`;
                }
            } catch (e) {
                // silencioso
            }
        }, 3000);
    }, [slug]);

    const addToCart = (gift: any) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === gift.id);
            if (existing) {
                return prev.map(item => item.id === gift.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item);
            }
            return [...prev, { ...gift, quantity: 1 }];
        });
        toast.success(`"${gift.name}" adicionado ao carrinho! 🛒`);
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, (item.quantity || 1) + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const cartTotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + getDisplayPrice(item.price) * (item.quantity || 1), 0);
    }, [cart, taxPayer, serviceTax]);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault()
        const checkoutItems = selected ? [{ id: selected.id, quantity: 1 }] : cart.map(item => ({ id: item.id, quantity: item.quantity }));
        
        if (checkoutItems.length === 0) return
        setSubmitting(true)
        try {
            const endpoint = `/api/gifts/checkout-infinitepay`;
            
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    slug,
                    items: selected ? [{ ...selected, quantity: 1, price: getDisplayPrice(selected.price) }] : cart.map(item => ({ ...item, price: getDisplayPrice(item.price) })),
                    total: selected ? getDisplayPrice(selected.price) : cartTotal,
                    guestName: name, 
                    email, 
                    message,
                    eventId 
                })
            })
            
            const data = await res.json()
            if (data.error) throw new Error(data.error);

            if (data.url) {
                // Limpa o carrinho do localStorage antes de redirecionar
                localStorage.removeItem(`cart_${slug}`);
                setCart([]);
                // Redireciona para o checkout seguro da InfinitePay
                window.location.href = data.url;
            } else {
                throw new Error('Não foi possível gerar o link de pagamento. Tente novamente.');
            }
        } catch (err: any) {
            console.error('Checkout error:', err);
            toast.error('Erro ao processar presente', { 
                description: err.message || 'Ocorreu um erro inesperado. Verifique sua conexão ou se o banco de dados foi atualizado.'
            })
        } finally {
            setSubmitting(false)
        }
    }

    if (contextLoading) return (
        <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-6 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8 }}>
                <div className="relative w-24 h-24 bg-white rounded-[2rem] shadow-xl border border-brand/5 flex items-center justify-center overflow-hidden mb-8 mx-auto">
                    <Image src="/logo_marsala.png" alt="Loading" width={80} height={80} className="object-contain drop-shadow-md" priority />
                    <motion.div className="absolute inset-0 border-2 border-brand/20 rounded-[2rem]"
                        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} />
                </div>
                <p className="font-serif italic text-text-primary text-xl tracking-tight">Preparando sua lista...</p>
            </motion.div>
        </div>
    )

    if (!isCorrectEvent) return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
            <p className="text-text-secondary font-serif italic">Evento não encontrado.</p>
        </div>
    )

    if (!eventSettings.isGiftListEnabled && !eventSettings.giftListInternalEnabled) {
        return (
            <div className="min-h-screen bg-bg-light flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-brand-pale rounded-full flex items-center justify-center mb-6 text-brand/40">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12V8H4v4M2 4h20v4H2zM12 4v16M7 12v8h10v-8" /></svg>
                </div>
                <h1 className="text-3xl font-serif text-text-primary mb-4">Lista de Presentes</h1>
                <p className="text-text-secondary max-w-md mx-auto font-serif italic text-base">A lista de presentes deste evento ainda não está disponível.</p>
                <Link href={`/${slug}`} className="mt-10 px-8 py-3 bg-brand text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl hover:-translate-y-1 transition-all">Voltar ao Início</Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-bg-light flex flex-col">

            {/* Top Navigation */}
            <div className="bg-surface/90 backdrop-blur-xl border-b border-border-soft sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href={`/${slug}`} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted hover:text-brand transition-colors group">
                        <svg className="group-hover:-translate-x-1 transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        VOLTAR
                    </Link>
                    <div className="flex flex-col items-center">
                        <span className="font-serif text-text-primary text-sm font-bold tracking-tight">{eventSettings.coupleNames}</span>
                        <div className="h-0.5 w-8 bg-brand/30 rounded-full mt-0.5" />
                    </div>
                    <Link href={`/${slug}/confirmar`} className="text-[10px] font-black uppercase tracking-[0.2em] text-brand hover:opacity-70 transition-opacity hidden sm:block bg-brand-pale px-4 py-2 rounded-full border border-brand/10">
                        RSVP →
                    </Link>
                    <div className="w-16 sm:hidden" />
                </div>
            </div>

            {/* Header */}
            <header className="bg-surface relative overflow-hidden py-20 px-6 border-b border-border-soft">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(var(--brand-rgb),0.03),transparent_50%)]" />
                <div className="max-w-3xl mx-auto relative z-10 text-center">
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                        className="w-16 h-16 bg-brand-pale rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-brand/10">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand">
                            <path d="M20 12V8H4v4M2 4h20v4H2zM12 4v16M7 12v8h10v-8" />
                        </svg>
                    </motion.div>
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                        className="text-[10px] font-black uppercase tracking-[0.5em] text-brand/60 mb-4 block">
                        LISTA DE PRESENTES
                    </motion.span>
                    <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                        className="text-5xl font-serif text-text-primary mb-6 leading-tight">
                        {eventSettings.coupleNames}
                    </motion.h1>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                        className="text-text-secondary text-lg leading-relaxed max-w-2xl mx-auto font-serif italic opacity-80">
                        "Nossa maior alegria é ter vocês conosco. Se desejarem nos presentear, sintam-se à vontade para escolher algo que tenha a nossa cara."
                    </motion.p>
                    {!loading && gifts.length > 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                            className="mt-8 inline-flex items-center gap-2 px-6 py-3 bg-brand-pale rounded-full border border-brand/10">
                            <span className="text-[11px] font-black uppercase tracking-widest text-brand">
                                {gifts.length} {gifts.length === 1 ? 'presente disponível' : 'presentes disponíveis'}
                            </span>
                        </motion.div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-16">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-6">
                        <div className="w-12 h-12 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-brand">Carregando...</p>
                    </div>
                ) : gifts.length === 0 ? (
                    <div className="text-center py-32 bg-surface rounded-[4rem] border-2 border-dashed border-border-soft">
                        <div className="w-20 h-20 bg-bg-light rounded-[3rem] flex items-center justify-center mx-auto mb-6 text-text-muted/30">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 12V8H4v4M2 4h20v4H2zM12 4v16" /></svg>
                        </div>
                        <p className="text-text-muted font-serif italic text-lg">A lista de presentes ainda está sendo preparada.</p>
                        <p className="text-text-muted/60 font-serif italic text-sm mt-2">Volte em breve! 💝</p>
                    </div>
                ) : (
                    <div className="space-y-20">
                        {Object.entries(groupedGifts).map(([sub, subGifts]) => (
                            <section key={sub} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <div className="flex items-center gap-4 mb-10 overflow-hidden">
                                    <div className="h-px bg-border-soft flex-1" />
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-text-muted whitespace-nowrap bg-bg-light px-8 py-2 rounded-full border border-border-soft">
                                        {SUBCATEGORY_NAMES[sub] || sub}
                                    </h2>
                                    <div className="h-px bg-border-soft flex-1" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                                    <AnimatePresence mode="popLayout">
                                        {subGifts.map(gift => (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                key={gift.id}
                                                className="group bg-surface rounded-[2.5rem] overflow-hidden border border-border-soft hover:shadow-2xl hover:border-brand/40 hover:-translate-y-2 transition-all relative flex flex-col"
                                            >
                                                {/* Price Badge */}
                                                <div className="absolute top-4 right-4 z-10 bg-brand text-white px-4 py-1.5 rounded-full shadow-xl shadow-brand/30 text-[11px] font-black tracking-tight transform group-hover:scale-110 transition-transform">
                                                    R$ {formatPrice(getDisplayPrice(gift.price))}
                                                </div>

                                                {/* Quota / Quantity Badge */}
                                                {gift.quantity && Number(gift.quantity) > 1 && (
                                                    <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-md text-brand border border-brand/20 px-3 py-1 rounded-full shadow-lg text-[9px] font-black uppercase tracking-wider">
                                                        {gift.quantity} {gift.is_quota ? 'Cotas' : 'Unidades'}
                                                    </div>
                                                )}

                                                {/* Image */}
                                                <div className="aspect-[4/3] relative overflow-hidden bg-bg-light flex-shrink-0">
                                                    {gift.image_url ? (
                                                        <Image 
                                                            src={gift.image_url} 
                                                            alt={gift.name} 
                                                            fill 
                                                            className="object-cover group-hover:scale-110 transition-transform duration-1000"
                                                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center text-brand/10">
                                                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 12V8H4v4M2 4h20v4H2zM12 4v16" /></svg>
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    
                                                    {/* Quick Add Overlay */}
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); addToCart(gift); }}
                                                            className="bg-white text-brand px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
                                                        >
                                                            + Carrinho
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Content — textos sem corte */}
                                                <div className="p-6 flex flex-col flex-1">
                                                    <h3 className="font-serif text-text-primary text-base font-bold mb-2 leading-snug group-hover:text-brand transition-colors">
                                                        {gift.name}
                                                    </h3>
                                                    <p className="text-[11px] text-text-secondary leading-relaxed opacity-70 mb-6 flex-1">
                                                        {gift.description || 'Um presente especial para nossa união.'}
                                                    </p>
                                                    
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setSelected(gift)}
                                                            className="flex-1 py-3 bg-brand-pale text-brand rounded-2xl flex items-center justify-center text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all shadow-inner"
                                                        >
                                                            COMPRAR
                                                        </button>
                                                        <button 
                                                            onClick={() => addToCart(gift)}
                                                            className="w-12 h-12 bg-bg-light border border-border-soft text-text-muted rounded-2xl flex items-center justify-center hover:text-brand hover:border-brand/40 transition-all active:scale-90"
                                                            title="Adicionar ao carrinho"
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="py-20 mt-20 border-t border-border-soft text-center bg-white">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 bg-bg-light rounded-full flex items-center justify-center border border-border-soft opacity-30">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-8-4.5-8-11.8A5.2 5.2 0 0 1 9.2 4a5.2 5.2 0 0 1 2.8 2.3A5.2 5.2 0 0 1 14.8 4 5.2 5.2 0 0 1 20 9.2c0 7.3-8 11.8-8 11.8z" /></svg>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-text-muted opacity-40">RSVP • Vanessa Bidinotti</p>
                </div>
            </footer>

            {/* Floating Cart Button */}
            {cart.length > 0 && (
                <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="fixed bottom-10 inset-x-0 z-50 flex justify-center px-6 pointer-events-none"
                >
                    <button 
                        onClick={() => setIsCartOpen(true)}
                        className="pointer-events-auto bg-brand text-white px-8 py-4 rounded-[2rem] shadow-[0_20px_50px_rgba(var(--brand-rgb),0.3)] flex items-center gap-4 hover:-translate-y-1 active:scale-95 transition-all group border border-white/20"
                    >
                        <div className="relative">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                            <span className="absolute -top-3 -right-3 w-6 h-6 bg-white text-brand rounded-full text-[10px] font-black flex items-center justify-center shadow-lg border-2 border-brand">
                                {cart.reduce((a, b) => a + (b.quantity || 1), 0)}
                            </span>
                        </div>
                        <div className="flex flex-col items-start leading-none gap-1">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Ver Carrinho</span>
                            <span className="text-sm font-bold tracking-tight">R$ {formatPrice(cartTotal)}</span>
                        </div>
                    </button>
                </motion.div>
            )}

            {/* Modal Checkout (Multi ou Single) */}
            <AnimatePresence>
                {(selected || isCartOpen) && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 30 }}
                            className="bg-surface rounded-[3rem] w-full max-w-lg flex flex-col max-h-[90vh] border border-border-soft shadow-[0_32px_128px_-12px_rgba(0,0,0,0.5)] overflow-hidden"
                        >
                            <div className="relative p-8 pb-4 border-b border-border-soft bg-bg-light/30">
                                <button onClick={() => { setSelected(null); setIsCartOpen(false); }} className="absolute top-8 right-8 w-10 h-10 bg-white rounded-3xl flex items-center justify-center text-text-muted hover:text-danger hover:scale-110 active:scale-95 transition-all z-20 shadow-sm border border-border-soft">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                                </button>
                                
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand">Finalizar Presente</span>
                                    <h3 className="font-serif text-text-primary text-2xl font-bold leading-tight">
                                        {selected ? 'Um presente especial' : `${cart.length} itens no carrinho`}
                                    </h3>
                                </div>
                            </div>

                            <div className="flex-1 p-8 pt-4 overflow-y-auto no-scrollbar space-y-8">
                                {/* Lista de Itens */}
                                <div className="space-y-3">
                                    {selected ? (
                                        <div className="flex gap-4 items-center p-4 bg-white rounded-2xl border border-brand/10 shadow-sm">
                                            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-bg-light">
                                                {selected.image_url && <img src={selected.image_url} alt="" className="w-full h-full object-cover" />}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-sm text-text-primary">{selected.name}</h4>
                                                <p className="text-xs text-brand font-black">R$ {formatPrice(getDisplayPrice(selected.price))}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        cart.map(item => (
                                            <div key={item.id} className="flex gap-4 items-center p-4 bg-white rounded-2xl border border-border-soft hover:border-brand/20 transition-all group overflow-hidden">
                                                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-bg-light shadow-inner">
                                                    {item.image_url && <img src={item.image_url} alt="" className="w-full h-full object-cover" />}
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-xs text-text-primary leading-tight mb-1">{item.name}</h4>
                                                    <p className="text-[10px] text-brand font-black">R$ {formatPrice(getDisplayPrice(item.price))}</p>
                                                </div>
                                                <div className="flex items-center gap-3 bg-bg-light p-1 rounded-xl border border-border-soft">
                                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-brand transition-colors"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12h14"/></svg></button>
                                                    <span className="text-[10px] font-black w-3 text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-brand transition-colors"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 5v14M5 12h14"/></svg></button>
                                                </div>
                                                <button onClick={() => removeFromCart(item.id)} className="text-text-muted/30 hover:text-danger p-1 transition-colors">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form id="gift-form" onSubmit={handleCheckout} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2">Seu Nome *</label>
                                            <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" className="w-full p-4 bg-bg-light border border-border-soft rounded-2xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2">E-mail</label>
                                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full p-4 bg-bg-light border border-border-soft rounded-2xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all shadow-inner" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2">Deixe aqui um recadinho que será entregue ao casal</label>
                                        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Deixe um recado carinhoso para o casal..." className="w-full p-4 bg-bg-light border border-border-soft rounded-2xl text-sm font-bold text-text-primary outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all resize-none h-24 shadow-inner" />
                                    </div>

                                    {/* MENSAGEM DE SEGURANÇA (Apenas Badge) */}

                                    {/* MENSAGEM DE SEGURANÇA UNIFICADA INFINITEPAY */}
                                    <div className="bg-brand/5 border border-brand/10 rounded-2xl p-4 flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand shrink-0 shadow-sm border border-brand/10">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-brand uppercase tracking-tight">Pagamento 100% Seguro</p>
                                            <p className="text-[10px] text-brand/70 font-bold tracking-tight leading-tight">Processado com criptografia via InfinitePay</p>
                                        </div>
                                    </div>

                                </form>
                            </div>

                            <div className="p-8 bg-bg-light border-t border-border-soft flex flex-col gap-4">
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Total Global</span>
                                    <span className="text-xl font-serif text-brand font-bold">
                                        R$ {formatPrice(selected ? getDisplayPrice(selected.price) : cartTotal)}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => { setSelected(null); setIsCartOpen(false); setPendingTx(null); setQrCodeData(null); if(pollingRef.current) clearInterval(pollingRef.current); }} className="py-5 border border-border-soft bg-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] text-text-muted hover:bg-bg-light transition-all shadow-sm">Voltar</button>
                                    {!qrCodeData ? (
                                        <button type="submit" form="gift-form" disabled={submitting || (cart.length === 0 && !selected)} className="py-5 bg-brand text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-brand/20 hover:bg-brand-dark hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'CONCLUIR 🎁'}
                                        </button>
                                    ) : (
                                        <div className="py-5 bg-emerald-50 text-emerald-700 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-emerald-200">
                                            <div className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin" />
                                            AGUARDANDO
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
