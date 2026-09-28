'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
    ChevronLeft, 
    Sparkles, 
    Check, 
    Plus, 
    Minus,
    Info, 
    X, 
    Globe, 
    Mountain, 
    Home, 
    Star,
    CheckCircle2,
    ArrowRight,
    ShoppingBag,
    Trash2,
    Layers
} from 'lucide-react';
import { COLLECTIONS, GIFT_TEMPLATES, LIBRARY_SECTIONS, CollectionMetadata } from '@/lib/gift-templates';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

// --- Components ---

function Badge({ children, active }: { children: React.ReactNode; active?: boolean }) {
    return (
        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
            active 
            ? 'bg-brand text-white shadow-lg shadow-brand/20' 
            : 'bg-bg-light text-text-muted border border-border-soft'
        }`}>
            {children}
        </span>
    );
}

interface ItemCustomization {
    price: number;
    quantity: number;
}

// --- Main Page Component ---

function BibliotecaContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const eventId = searchParams.get('eventId');
    
    const [selectedCollection, setSelectedCollection] = useState<CollectionMetadata | null>(null);
    const [selectedItems, setSelectedItems] = useState<string[]>([]); 
    const [customizations, setCustomizations] = useState<Record<string, ItemCustomization>>({});
    const [importing, setImporting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [expandedSections, setExpandedSections] = useState<string[]>([]);
    const [config, setConfig] = useState<Record<string, boolean>>({});
    const [loadingConfig, setLoadingConfig] = useState(true);

    const handleToggleExpand = (sectionId: string) => {
        setExpandedSections(prev => 
            prev.includes(sectionId) ? prev.filter(s => s !== sectionId) : [...prev, sectionId]
        );
    };

    // Buscar configurações do banco
    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch('/api/admin/gift-library/config');
                const data = await res.json();
                const configMap: Record<string, boolean> = {};
                data.forEach((item: any) => {
                    configMap[item.id] = item.is_enabled;
                });
                setConfig(configMap);
            } catch (e) {
                console.error('Erro ao carregar config da biblioteca');
            } finally {
                setLoadingConfig(false);
            }
        }
        fetchConfig();
    }, []);

    const sections = useMemo(() => {
        if (loadingConfig) return [];
        return LIBRARY_SECTIONS.map(s => {
            const isEnabled = config[`section:${s.id}`] !== false;
            if (!isEnabled) return null;

            return {
                ...s,
                icon: s.id === 'DESTAQUES' ? <Star className="text-brand" size={18} /> :
                      s.id === 'INTERNACIONAL' ? <Globe className="text-brand" size={18} /> :
                      s.id === 'NACIONAL' ? <Mountain className="text-brand" size={18} /> :
                      s.id === 'TEMATICA' ? <Sparkles className="text-brand" size={18} /> :
                      <Home className="text-brand" size={18} />
            };
        }).filter(Boolean) as any[];
    }, [config, loadingConfig]);

    // Filter items based on collection subcategory
    const collectionItems = useMemo(() => {
        if (!selectedCollection) return [];
        return GIFT_TEMPLATES.filter(t => t.subcategory === selectedCollection.id);
    }, [selectedCollection]);

    // Ao selecionar uma coleção, inicializa todos os itens selecionados e suas customizações padrão
    useEffect(() => {
        if (selectedCollection) {
            setSelectedItems(collectionItems.map(i => i.name));
            const initialMap: Record<string, ItemCustomization> = {};
            collectionItems.forEach(item => {
                initialMap[item.name] = {
                    price: Number(item.price),
                    quantity: item.quantity ? Number(item.quantity) : 1
                };
            });
            setCustomizations(initialMap);
        } else {
            setSelectedItems([]);
            setCustomizations({});
        }
    }, [selectedCollection, collectionItems]);

    const handleToggleItem = (name: string) => {
        setSelectedItems(prev => 
            prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
        );
    };

    const handleToggleAll = () => {
        if (selectedItems.length === collectionItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(collectionItems.map(i => i.name));
        }
    };

    const handlePriceChange = (name: string, rawVal: string) => {
        const parsed = parseFloat(rawVal.replace(',', '.'));
        setCustomizations(prev => ({
            ...prev,
            [name]: {
                price: isNaN(parsed) ? 0 : Math.max(0, parsed),
                quantity: prev[name]?.quantity ?? 1
            }
        }));
    };

    const handleQuantityChange = (name: string, delta: number) => {
        setCustomizations(prev => {
            const currentQty = prev[name]?.quantity ?? 1;
            const currentPrice = prev[name]?.price ?? (collectionItems.find(i => i.name === name)?.price || 0);
            const newQty = Math.max(1, currentQty + delta);
            return {
                ...prev,
                [name]: {
                    price: currentPrice,
                    quantity: newQty
                }
            };
        });
    };

    const handleQuantityDirectInput = (name: string, rawVal: string) => {
        const parsed = parseInt(rawVal, 10);
        setCustomizations(prev => ({
            ...prev,
            [name]: {
                price: prev[name]?.price ?? (collectionItems.find(i => i.name === name)?.price || 0),
                quantity: isNaN(parsed) || parsed < 1 ? 1 : parsed
            }
        }));
    };

    // Total considerando preços e quantidades customizadas
    const selectedTotal = useMemo(() => {
        return collectionItems
            .filter(i => selectedItems.includes(i.name))
            .reduce((sum, item) => {
                const custom = customizations[item.name];
                const price = custom?.price ?? item.price;
                const qty = custom?.quantity ?? (item.quantity || 1);
                return sum + (price * qty);
            }, 0);
    }, [collectionItems, selectedItems, customizations]);

    const totalQuotasCount = useMemo(() => {
        return collectionItems
            .filter(i => selectedItems.includes(i.name))
            .reduce((sum, item) => {
                const qty = customizations[item.name]?.quantity ?? (item.quantity || 1);
                return sum + qty;
            }, 0);
    }, [collectionItems, selectedItems, customizations]);

    const handleImport = async () => {
        if (!eventId || selectedItems.length === 0) return;
        
        setImporting(true);
        setStatus(null);
        
        try {
            const itemsToImport = collectionItems
                .filter(item => selectedItems.includes(item.name))
                .map(item => {
                    const custom = customizations[item.name];
                    const price = custom !== undefined ? custom.price : item.price;
                    const quantity = custom !== undefined ? custom.quantity : (item.quantity || 1);
                    return {
                        ...item,
                        price: price,
                        quantity: quantity,
                        isQuota: quantity > 1 || item.isQuota || false
                    };
                });
            
            const res = await fetch(`/api/events/${eventId}/gifts/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    category: selectedCollection?.category,
                    subcategory: selectedCollection?.id,
                    items: itemsToImport 
                })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setStatus({ 
                    type: 'success', 
                    message: `${data.count} presentes (${totalQuotasCount} cotas/unidades) adicionados com sucesso à sua lista!` 
                });
                setTimeout(() => {
                    router.push('/dashboard?tab=gifts');
                }, 2000);
            } else {
                setStatus({ type: 'error', message: data.error || 'Erro ao importar presentes.' });
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Erro de conexão.' });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-light pb-32">
            {/* Header Fixo */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border-soft px-6 py-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => selectedCollection ? setSelectedCollection(null) : router.back()}
                            className="w-10 h-10 rounded-full border border-border-soft flex items-center justify-center hover:bg-bg-light transition-all active:scale-90"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-serif text-text-primary tracking-tight">
                                {selectedCollection ? selectedCollection.name : 'Biblioteca de Presentes'}
                            </h1>
                            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                                {selectedCollection ? `${selectedItems.length} de ${collectionItems.length} selecionados (${totalQuotasCount} cotas/unidades)` : 'Curadoria exclusiva de modelos'}
                            </p>
                        </div>
                    </div>

                    {selectedCollection && (
                        <button 
                            onClick={handleImport}
                            disabled={selectedItems.length === 0 || importing}
                            className="px-6 py-3 bg-brand text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand/20 hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {importing ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Plus size={14} />
                            )}
                            Finalizar Importação ({selectedItems.length})
                        </button>
                    )}
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 pt-12">
                {loadingConfig ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
                        <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Carregando modelos...</p>
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {!selectedCollection ? (
                            /* SECTIONED GALLERY VIEW */
                            <motion.div 
                                key="gallery"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-20 pb-20"
                            >
                            {sections.map(section => {
                                const sectionCollections = COLLECTIONS.filter(c => 
                                    c.category === section.id && 
                                    config[`collection:${c.id}`] !== false
                                );
                                if (sectionCollections.length === 0) return null;
                                
                                const isExpanded = expandedSections.includes(section.id);
                                const displayedCollections = isExpanded ? sectionCollections : sectionCollections.slice(0, 3);

                                return (
                                    <div key={section.id} className="space-y-8">
                                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-l-4 border-brand pl-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    {section.icon}
                                                    <h2 className="text-2xl font-serif text-text-primary tracking-tight">{section.title}</h2>
                                                </div>
                                                <p className="text-sm text-text-muted italic font-serif leading-relaxed">{section.description}</p>
                                            </div>
                                            {sectionCollections.length > 3 && (
                                                <button 
                                                    onClick={() => handleToggleExpand(section.id)}
                                                    className="text-[10px] font-black uppercase tracking-widest text-brand flex items-center gap-1 hover:underline"
                                                >
                                                    {isExpanded ? 'Ver menos' : `Ver mais ${section.title.toLowerCase()}`}
                                                    <ArrowRight size={12} className={isExpanded ? '-rotate-90 transition-transform' : ''} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                            {displayedCollections.map((col, idx) => (
                                                <motion.div
                                                    key={col.id}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.05 }}
                                                    onClick={() => setSelectedCollection(col)}
                                                    className="group cursor-pointer bg-white rounded-[2.5rem] border border-border-soft shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all p-2 overflow-hidden"
                                                >
                                                    <div className="relative aspect-[4/3] rounded-[2.2rem] overflow-hidden">
                                                        <Image 
                                                            src={col.coverImage} 
                                                            alt={col.name} 
                                                            fill 
                                                            className="object-cover group-hover:scale-110 transition-transform duration-700"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10 opacity-70 group-hover:opacity-80 transition-opacity" />
                                                        
                                                        <div className="absolute top-4 left-4">
                                                            <Badge active>{col.category}</Badge>
                                                        </div>
                                                        
                                                        <div className="absolute bottom-6 left-6 right-6 z-20">
                                                            <h3 className="text-2xl font-black !text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,1)] line-clamp-2 leading-tight">
                                                                {col.name}
                                                            </h3>
                                                            <div className="flex items-center gap-2 mt-3">
                                                                <div className="w-1.5 h-3 bg-brand rounded-full shadow-[0_0_8px_rgba(var(--brand-rgb),0.6)]" />
                                                                <p className="text-[11px] font-black !text-white/90 uppercase tracking-[0.12em] drop-shadow-md">
                                                                    Média: R$ {col.estimatedTotal.toLocaleString('pt-BR')}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="p-6 pb-4">
                                                        <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed h-10 italic font-medium">
                                                            "{col.description}"
                                                        </p>
                                                        <div className="mt-6 pt-4 border-t border-border-soft flex items-center justify-between">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black text-brand uppercase tracking-widest">{col.itemCount} Itens Prontos</span>
                                                                <span className="text-[9px] text-text-muted mt-0.5">Disponíveis para importar</span>
                                                            </div>
                                                            <div className="w-10 h-10 rounded-full bg-brand-pale text-brand flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-all shadow-inner group-hover:shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)]">
                                                                <ArrowRight size={18} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    ) : (
                        /* SELECTION VIEW (PRODUCT GRID) */
                        <motion.div 
                            key="selection"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="space-y-6"
                        >
                            {/* Toolbar de Seleção */}
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2rem] border border-border-soft shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-brand-pale rounded-2xl flex items-center justify-center text-brand">
                                        <ShoppingBag size={24} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Coleção Selecionada</p>
                                        <h2 className="text-xl font-serif text-text-primary">{selectedCollection.name}</h2>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button 
                                        onClick={handleToggleAll}
                                        className="px-5 py-2.5 border border-border-soft rounded-full text-[10px] font-black uppercase tracking-widest text-text-muted hover:bg-bg-light transition-all"
                                    >
                                        {selectedItems.length === collectionItems.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                    </button>
                                    <div className="h-8 w-px bg-border-soft mx-1" />
                                    <div className="flex items-center gap-2 bg-brand/5 border border-brand/20 px-4 py-2 rounded-2xl">
                                        <Layers size={14} className="text-brand" />
                                        <p className="text-[11px] font-black text-brand uppercase tracking-wider">
                                            Total: R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Dica amigável */}
                            <div className="p-4 bg-brand/5 border border-brand/20 rounded-2xl flex items-center gap-3">
                                <Sparkles className="shrink-0 text-brand" size={18} />
                                <p className="text-xs text-text-primary font-medium leading-relaxed">
                                    <strong>Personalize seus presentes:</strong> Você pode ajustar o <strong>valor unitário</strong> e a <strong>quantidade de cotas</strong> diretamente em cada item abaixo antes de importar.
                                </p>
                            </div>

                            {/* Grid de Itens */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {collectionItems.map((item, idx) => {
                                    const isSelected = selectedItems.includes(item.name);
                                    const custom = customizations[item.name] || {
                                        price: Number(item.price),
                                        quantity: item.quantity ? Number(item.quantity) : 1
                                    };
                                    const subtotal = custom.price * custom.quantity;

                                    return (
                                        <motion.div
                                            key={item.name}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className={`group relative bg-white rounded-[2rem] border-2 transition-all p-4 shadow-sm hover:shadow-xl flex flex-col justify-between ${
                                                isSelected 
                                                ? 'border-brand ring-4 ring-brand/5' 
                                                : 'border-border-soft opacity-60 hover:opacity-100 hover:border-brand/40'
                                            }`}
                                        >
                                            <div>
                                                {/* Imagem com clique para alternar seleção */}
                                                <div 
                                                    onClick={() => handleToggleItem(item.name)}
                                                    className="relative aspect-square rounded-[1.5rem] overflow-hidden mb-4 cursor-pointer select-none"
                                                >
                                                    <Image 
                                                        src={item.imageUrl} 
                                                        alt={item.name} 
                                                        fill 
                                                        className={`object-cover transition-all duration-500 ${isSelected ? 'scale-105' : 'grayscale-[0.4] group-hover:grayscale-0'}`}
                                                    />
                                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                                                    
                                                    {/* Badge de Seleção / Check */}
                                                    <div className={`absolute top-3 left-3 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                                        isSelected 
                                                        ? 'bg-brand border-brand text-white shadow-lg shadow-brand/40 scale-105' 
                                                        : 'bg-white/80 backdrop-blur-sm border-border-soft text-transparent hover:border-brand/50'
                                                    }`}>
                                                        <Check size={16} strokeWidth={3} />
                                                    </div>

                                                    {/* Badge de Valor no Card */}
                                                    <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-border-soft/50">
                                                        <span className="text-[10px] font-black text-text-primary uppercase tracking-tight">
                                                            R$ {custom.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Textos */}
                                                <div className="px-1 mb-4">
                                                    <h4 
                                                        onClick={() => handleToggleItem(item.name)}
                                                        className="text-sm font-black text-text-primary tracking-tight line-clamp-2 mb-1.5 cursor-pointer hover:text-brand transition-colors"
                                                        title={item.name}
                                                    >
                                                        {item.name}
                                                    </h4>
                                                    <p 
                                                        className="text-[11px] text-text-muted leading-relaxed line-clamp-2 italic font-serif"
                                                        title={item.description}
                                                    >
                                                        {item.description}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Campos de Ajuste de Preço e Quantidade (Cotas) */}
                                            <div 
                                                className={`mt-2 pt-3 border-t border-border-soft space-y-3 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {/* Input de Valor Unitário */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                                                            Valor Unitário
                                                        </label>
                                                        {custom.price !== item.price && (
                                                            <span className="text-[8px] font-bold text-brand uppercase">Editado</span>
                                                        )}
                                                    </div>
                                                    <div className="relative flex items-center">
                                                        <span className="absolute left-3 text-xs font-black text-text-muted">R$</span>
                                                        <input 
                                                            type="number"
                                                            step="0.01"
                                                            min="1"
                                                            value={custom.price}
                                                            onChange={(e) => handlePriceChange(item.name, e.target.value)}
                                                            className="w-full pl-8 pr-3 py-2 bg-bg-light border border-border-soft rounded-xl text-xs font-black text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Stepper de Quantidade / Cotas */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">
                                                            Quantidade / Cotas
                                                        </label>
                                                        <span className="text-[9px] font-bold text-text-muted">
                                                            {custom.quantity === 1 ? '1 cota' : `${custom.quantity} cotas`}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleQuantityChange(item.name, -1)}
                                                            disabled={custom.quantity <= 1}
                                                            className="w-9 h-9 rounded-xl bg-bg-light border border-border-soft flex items-center justify-center text-text-muted hover:text-brand hover:border-brand/40 transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95"
                                                        >
                                                            <Minus size={14} strokeWidth={2.5} />
                                                        </button>
                                                        <input 
                                                            type="number"
                                                            min="1"
                                                            value={custom.quantity}
                                                            onChange={(e) => handleQuantityDirectInput(item.name, e.target.value)}
                                                            className="w-full text-center py-2 bg-bg-light border border-border-soft rounded-xl text-xs font-black text-text-primary outline-none focus:border-brand transition-all"
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleQuantityChange(item.name, 1)}
                                                            className="w-9 h-9 rounded-xl bg-bg-light border border-border-soft flex items-center justify-center text-text-muted hover:text-brand hover:border-brand/40 transition-all active:scale-95"
                                                        >
                                                            <Plus size={14} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Subtotal se cotas > 1 */}
                                                {custom.quantity > 1 && (
                                                    <div className="pt-2 flex justify-between items-center text-[10px] font-black border-t border-dashed border-border-soft">
                                                        <span className="text-text-muted uppercase tracking-wider">Subtotal:</span>
                                                        <span className="text-brand">
                                                            {custom.quantity}x de R$ {custom.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                )}
            </main>

            {/* Status Feedback Overlays */}
            <AnimatePresence>
                {status && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
                    >
                        <div className={`p-6 rounded-[2rem] border shadow-2xl flex items-center gap-4 ${
                            status.type === 'success' 
                            ? 'bg-emerald-600 border-emerald-500 text-white' 
                            : 'bg-rose-600 border-rose-500 text-white'
                        }`}>
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                                {status.type === 'success' ? <CheckCircle2 size={24} /> : <Trash2 size={24} />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-black uppercase tracking-widest">{status.type === 'success' ? 'Sucesso!' : 'Opa!'}</p>
                                <p className="text-xs opacity-90 font-medium">{status.message}</p>
                            </div>
                            {status.type === 'error' && (
                                <button onClick={() => setStatus(null)} className="opacity-50 hover:opacity-100 transition-opacity">
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Fixed bottom import bar (Mobile only) */}
            {selectedCollection && !status && (
                <motion.div 
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-border-soft z-40 md:hidden"
                >
                    <button 
                        onClick={handleImport}
                        disabled={selectedItems.length === 0 || importing}
                        className="w-full py-4 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
                    >
                        {importing ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={16} />}
                        Importar {selectedItems.length} Presentes ({totalQuotasCount} cotas)
                    </button>
                </motion.div>
            )}
        </div>
    );
}

export default function BibliotecaPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-bg-light flex items-center justify-center"><span className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin" /></div>}>
            <BibliotecaContent />
        </Suspense>
    );
}
