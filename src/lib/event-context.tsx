'use client'

import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { useAdmin } from './admin-context'
import { useAuth } from './auth-context'
import { supabase } from './supabase'
import { toast } from 'sonner'

export type GuestStatus = 'confirmed' | 'pending' | 'declined'
export type GuestCategory = 'adult_paying' | 'child_paying' | 'child_not_paying'

export type Companion = {
    name: string
    isConfirmed: boolean
    category?: GuestCategory
}

export type Guest = {
    id: string
    name: string
    email?: string
    telefone?: string
    grupo?: string
    companions: number
    companionsList: Companion[]
    status: GuestStatus
    category: GuestCategory
    updatedAt: Date
    confirmedAt?: Date
    message?: string
}

export type EventSettings = {
    eventType: 'casamento' | 'debutante'
    coupleNames: string
    slug: string
    eventDate: string
    eventTime?: string
    confirmationDeadline: string
    eventLocation: string
    eventAddress?: string
    wazeLocation?: string
    hasSeparateCeremony?: boolean
    ceremonyLocation?: string
    ceremonyAddress?: string
    ceremonyWazeLocation?: string
    ceremonyTime?: string
    coverImage: string
    coverImagePosition: number
    coverImageScale: number
    customMessage: string
    giftListLinks?: { name: string; url: string }[]
    notifyOwnerOnRSVP?: boolean
    carouselImages?: string[]
    coupleStory?: string
    coupleStoryTitle?: string
    timelineEvents?: { emoji: string; title: string; description: string; image?: string }[]
    galleryImages?: string[]
    dressCode?: string
    parkingSettings?: {
        hasParking: boolean
        type: 'free' | 'valet' | 'suggestion'
        price?: string
        address?: string
        wazeLocation?: string
        receptionOnly?: boolean
    }
    brandColor?: string
    brandFont?: string
    isGiftListEnabled?: boolean
    giftListInternalEnabled?: boolean
    hasCompletedOnboarding?: boolean
    emailConfirmationTitle?: string
    emailConfirmationGreeting?: string
    serviceTax?: number
    notificationSettings?: {
        rsvp: boolean
        gifts: boolean
        mural: boolean
        withdrawals: boolean
    }
}

type EventContextType = {
    eventId: string | null
    guests: Guest[]
    eventSettings: EventSettings
    ownerEmail?: string
    loading: boolean
    metrics: {
        total: number
        confirmed: number
        pending: number
        declined: number
        totalPeople: number
        adults: number
        childrenPaying: number
        childrenFree: number
        confirmedAdults: number
        confirmedChildrenPaying: number
        confirmedChildrenFree: number
    }
    addGuest: (guest: Omit<Guest, 'id' | 'updatedAt' | 'status'>) => Promise<boolean>
    addGuestsBatch: (dataList: Omit<Guest, 'id' | 'updatedAt' | 'status'>[]) => Promise<{
        imported: number,
        duplicates: string[],
        error?: string
    }>
    removeGuest: (id: string) => Promise<void>
    updateGuestStatus: (id: string, status: GuestStatus) => Promise<void>
    updateGuest: (id: string, guest: Partial<Guest>) => Promise<void>
    updateGuestCompanions: (id: string, companions: Companion[]) => Promise<void>
    removeCompanion: (guestId: string, companionIndex: number) => Promise<void>
    updateEventSettings: (settings: Partial<EventSettings>) => Promise<void>
    submitRSVP: (rsvpData: Omit<Guest, 'id' | 'updatedAt'>) => Promise<void>
    refreshData: () => Promise<void>
}

const DEFAULT_EVENT_SETTINGS: EventSettings = {
    eventType: 'casamento',
    coupleNames: 'Nome do Casal',
    slug: 'meu-evento',
    eventDate: new Date().toISOString().split('T')[0],
    eventTime: '19:00',
    confirmationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    eventLocation: 'Espaço e Buffet - Endereço',
    wazeLocation: '',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=2069&auto=format&fit=crop',
    coverImagePosition: 50,
    coverImageScale: 1,
    customMessage: 'Sejam bem-vindos! Ficamos felizes em compartilhar este momento com vocês.',
    giftListLinks: [],
    notifyOwnerOnRSVP: true,
    carouselImages: [],
    coupleStory: '',
    timelineEvents: [
        { emoji: '💫', title: 'O primeiro encontro', description: 'O começo de tudo' },
        { emoji: '💌', title: 'Nossa memória favorita', description: 'A decisão mais fácil das nossas vidas' },
        { emoji: '💍', title: 'O pedido de casamento', description: 'Uma surpresa guardada no coração' }
    ],
    galleryImages: [],
    dressCode: '',
    parkingSettings: {
        hasParking: false,
        type: 'free',
        price: '',
        address: ''
    },
    brandColor: '#7b2d3d',
    brandFont: 'lora',
    isGiftListEnabled: false,
    giftListInternalEnabled: false,
    hasCompletedOnboarding: false,
    serviceTax: 5.49,
    notificationSettings: {
        rsvp: true,
        gifts: true,
        mural: true,
        withdrawals: true
    }
}

export const EventContext = createContext<EventContextType | undefined>(undefined)

export function EventProvider({ children }: { children: ReactNode }) {
    const params = useParams()
    const pathname = usePathname()
    const slug = params?.slug as string
    const { user } = useAuth()
    const { events, updateEvent, loading: adminLoading } = useAdmin()

    const eventIdFromParams = params?.id as string
    const eventId = useMemo(() => {
        if (adminLoading) return null
        if (eventIdFromParams) return eventIdFromParams
        if (slug) {
            const event = events.find(e =>
                e.slug?.toLowerCase() === slug.toLowerCase() ||
                e.eventSettings.slug?.toLowerCase() === slug.toLowerCase()
            )
            return event?.id || null
        }
        // Se estamos no /dashboard (sem slug), procuramos o evento criado por este usuário
        if (user) {
            const userEmailLower = user.email ? user.email.toLowerCase() : ''
            const userEvent = events.find(e => {
                const createdByLower = e.createdBy ? e.createdBy.toLowerCase() : ''
                return createdByLower === userEmailLower
            })
            return userEvent?.id || null
        }
        return null
    }, [slug, events, eventIdFromParams, user, adminLoading])

    const [guests, setGuests] = useState<Guest[]>([])
    const [eventSettings, setEventSettings] = useState<EventSettings>(DEFAULT_EVENT_SETTINGS)
    const [loading, setLoading] = useState(false)
    const [ownerEmailFallback, setOwnerEmailFallback] = useState<string | null>(null)


    const ownerEmail = useMemo(() => {
        const found = events.find(e => e.id === eventId || e.slug === slug)
        return found?.createdBy || ownerEmailFallback || undefined
    }, [eventId, slug, events, ownerEmailFallback])

    useEffect(() => {
        async function fetchSettings() {
            // 1. Tentar encontrar no contexto administrativo (já carregado)
            const foundInAdmin = events.find(e =>
                (eventId && e.id === eventId) ||
                (slug && (e.slug?.toLowerCase() === slug.toLowerCase() || e.eventSettings.slug?.toLowerCase() === slug.toLowerCase()))
            )

            if (foundInAdmin) {
                setEventSettings(foundInAdmin.eventSettings)
                return
            }

            // 2. Se não estiver no contexto or o contexto falhou (timeout), buscar direto no Supabase
            if (slug || eventId || user?.email) {
                setLoading(true)
                setLoading(true)
                try {
                    let query = supabase.from('events').select('id, event_settings, notification_settings, gift_list_enabled, created_by')
                    
                    if (eventId) {
                        query = query.eq('id', eventId)
                    } else if (slug) {
                        query = query.eq('slug', slug)
                    } else if (user?.email) {
                        // Busca o evento criado por este usuário em caso de Dashboard sem ID/Slug
                        query = query.eq('created_by', user.email).order('created_at', { ascending: false }).limit(1)
                    }

                    const { data: result, error } = await query.maybeSingle()
                    const data = Array.isArray(result) ? result[0] : result

                    if (data && data.event_settings) {
                        if (data.created_by) {
                            setOwnerEmailFallback(data.created_by)
                        }
                        const settings = data.event_settings as EventSettings
                        setEventSettings({
                            ...settings,
                            isGiftListEnabled: settings.isGiftListEnabled ?? true,
                            giftListInternalEnabled: data.gift_list_enabled ?? false,
                            notificationSettings: data.notification_settings || settings.notificationSettings || {
                                rsvp: true,
                                gifts: true,
                                mural: true,
                                withdrawals: true
                            }
                        })
                    }
                } catch (err) {
                    console.error('Erro ao buscar configurações do evento:', err)
                } finally {
                    setLoading(false)
                }
            }
        }

        fetchSettings()
    }, [eventId, slug, events])

    async function loadGuests() {
        if (!eventId) return
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('guests')
                .select('id, name, email, telefone, grupo, status, category, companions_list, updated_at, confirmed_at, message')
                .eq('event_id', eventId)
                .order('updated_at', { ascending: false })

            if (error) throw error

            setGuests((data || []).map(g => ({
                id: g.id,
                name: g.name,
                email: g.email || '',
                telefone: g.telefone || '',
                grupo: g.grupo || '',
                companions: g.companions_list?.length || 0,
                companionsList: g.companions_list || [],
                status: g.status as GuestStatus,
                category: g.category as GuestCategory,
                updatedAt: new Date(g.updated_at),
                confirmedAt: g.confirmed_at ? new Date(g.confirmed_at) : undefined
            })))
        } catch (error) {
            console.error('Erro ao carregar convidados:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadGuests()
    }, [eventId])

    const refreshData = useCallback(async () => {
        await loadGuests()
    }, [eventId]) // loadGuests uses eventId

    // 🔔 Debounce ref para evitar loops de re-fetch
    const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null)
    const debouncedLoadGuests = useCallback(() => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
        realtimeDebounceRef.current = setTimeout(() => {
            loadGuests()
        }, 2000)
    }, [eventId])

    // REAL-TIME UPDATES
    useEffect(() => {
        if (!eventId || !user) return

        const channel = supabase
            .channel(`guests-realtime-${eventId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'guests',
                    filter: `event_id=eq.${eventId}`
                },
                (payload) => {
                    // Usar debounce para evitar múltiplos fetches simultâneos
                    debouncedLoadGuests()

                    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                        const newGuest = payload.new as any
                        const oldGuest = payload.old as any

                        // Apenas enviar toast se confirmou ou recusou agora e se estivermos no dashboard
                        const isManagementPage = pathname?.startsWith('/dashboard') || pathname?.startsWith('/settings') || pathname?.startsWith('/admin')
                        
                        if (isManagementPage && newGuest.status !== 'pending' && (!oldGuest || oldGuest.status !== newGuest.status)) {
                            const isConfirmed = newGuest.status === 'confirmed'

                            toast.success(
                                <div className="flex flex-col gap-1">
                                    <span className="font-black text-xs uppercase tracking-widest block">
                                        {isConfirmed ? '🔔 Nova Confirmação!' : '✗ Nova Ausência'}
                                    </span>
                                    <span className="text-sm">
                                        <strong>{newGuest.name}</strong> {isConfirmed ? 'confirmou' : 'recusou'} presença.
                                    </span>
                                </div>,
                                {
                                    duration: 5000,
                                    icon: isConfirmed ? '✅' : '❌'
                                }
                            )
                        }
                    }
                }
            )
            .subscribe()

        return () => {
            if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
            supabase.removeChannel(channel)
        }
    }, [eventId, user])

    const metrics = useMemo(() => {
        const initial = {
            total: 0,
            confirmed: 0,
            pending: 0,
            declined: 0,
            totalPeople: 0, // Alias para confirmed
            adults: 0,
            childrenPaying: 0,
            childrenFree: 0,
            confirmedAdults: 0,
            confirmedChildrenPaying: 0,
            confirmedChildrenFree: 0
        }

        return guests.reduce((acc, guest) => {
            const isConfirmed = guest.status === 'confirmed'
            const isPending = guest.status === 'pending'
            const isDeclined = guest.status === 'declined'

            // Convidado Principal
            acc.total += 1
            if (guest.category === 'adult_paying' || !guest.category) acc.adults += 1
            else if (guest.category === 'child_paying') acc.childrenPaying += 1
            else if (guest.category === 'child_not_paying') acc.childrenFree += 1

            if (isConfirmed) {
                acc.confirmed += 1
                if (guest.category === 'adult_paying' || !guest.category) acc.confirmedAdults += 1
                else if (guest.category === 'child_paying') acc.confirmedChildrenPaying += 1
                else if (guest.category === 'child_not_paying') acc.confirmedChildrenFree += 1
            } else if (isPending) {
                acc.pending += 1
            } else if (isDeclined) {
                acc.declined += 1
            }

            // Acompanhantes
            guest.companionsList?.forEach(comp => {
                acc.total += 1
                const cat = comp.category || 'adult_paying'
                if (cat === 'adult_paying') acc.adults += 1
                else if (cat === 'child_paying') acc.childrenPaying += 1
                else if (cat === 'child_not_paying') acc.childrenFree += 1

                if (isConfirmed && comp.isConfirmed) {
                    acc.confirmed += 1
                    if (cat === 'adult_paying') acc.confirmedAdults += 1
                    else if (cat === 'child_paying') acc.confirmedChildrenPaying += 1
                    else if (cat === 'child_not_paying') acc.confirmedChildrenFree += 1
                } else if (isPending) {
                    acc.pending += 1
                } else if (isDeclined || (isConfirmed && !comp.isConfirmed)) {
                    acc.declined += 1
                }
            })

            acc.totalPeople = acc.confirmed // Sincroniza alias
            return acc
        }, initial)
    }, [guests])

    const addGuest = useCallback(async (data: Omit<Guest, 'id' | 'updatedAt' | 'status'>) => {
        if (!eventId) return false
        const newId = Math.random().toString(36).substr(2, 9)
        const newGuest: Guest = {
            ...data,
            id: newId,
            status: 'pending',
            updatedAt: new Date(),
            companionsList: data.companionsList || []
        }

        try {
            const res = await fetch('/api/guests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    guest: {
                        id: newId,
                        name: data.name,
                        email: data.email,
                        telefone: data.telefone,
                        grupo: data.grupo,
                        category: data.category,
                        companionsList: data.companionsList || []
                    }
                })
            })

            const resData = await res.json()
            if (!res.ok) {
                console.error('[EventContext] Erro ao cadastrar convidado:', resData)
                throw new Error(resData.error || 'Erro ao salvar convidado')
            }

            setGuests(prev => [newGuest, ...prev])
            return true
        } catch (error) {
            console.error('Erro ao adicionar convidado:', error)
            return false
        }
    }, [eventId])

    const addGuestsBatch = useCallback(async (dataList: Omit<Guest, 'id' | 'updatedAt' | 'status'>[]) => {
        if (!eventId) {
            return { imported: 0, duplicates: [], error: 'Nenhum evento encontrado para o usuário atual.' }
        }
        const duplicates: string[] = []
        const toImport: any[] = []
        const newGuests: Guest[] = []

        dataList.forEach(data => {
            const isDuplicate = guests.some(g => g.name.toLowerCase() === data.name.toLowerCase() && g.telefone === data.telefone)
            if (isDuplicate) {
                duplicates.push(data.name)
            } else {
                const newId = Math.random().toString(36).substr(2, 9)
                const now = new Date()
                const guestDataToInsert = {
                    id: newId,
                    name: data.name,
                    email: data.email || '',
                    telefone: data.telefone || '',
                    grupo: data.grupo || '',
                    category: data.category,
                    companionsList: data.companionsList || []
                }

                toImport.push(guestDataToInsert)
                newGuests.push({
                    ...data,
                    id: newId,
                    status: 'pending',
                    updatedAt: now,
                    companionsList: data.companionsList || []
                })
            }
        })

        if (toImport.length > 0) {
            try {
                const res = await fetch('/api/guests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        eventId,
                        guests: toImport
                    })
                })

                const resData = await res.json()
                if (!res.ok) {
                    console.error('[EventContext] Erro no batch import:', resData)
                    throw new Error(resData.error || 'Erro ao salvar convidados')
                }

                setGuests(prev => [...newGuests, ...prev])
                return { imported: toImport.length, duplicates }
            } catch (error: any) {
                console.error('Erro no batch import:', error)
                return { imported: 0, duplicates: [], error: error.message || 'Erro ao salvar convidados' }
            }
        }

        return { imported: 0, duplicates }
    }, [eventId, guests])

    const removeGuest = useCallback(async (id: string) => {
        try {
            if (!eventId) throw new Error('Evento não identificado')

            // Usar API para garantir permissão no servidor
            const res = await fetch(`/api/guests/${id}?eventId=${eventId}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Erro ao excluir convidado')
            }

            setGuests(prev => prev.filter(g => g.id !== id))
            toast.success('Convidado removido.')
        } catch (error: any) {
            console.error('Erro ao remover convidado:', error)
            toast.error('Erro ao excluir', { description: error.message })
        }
    }, [eventId])

    const updateGuest = useCallback(async (id: string, guestData: Partial<Guest>) => {
        if (!eventId) {
            console.error('updateGuest: eventId não identificado')
            throw new Error('Evento não identificado')
        }
        
        try {
            const now = new Date()
            
            // Formatamos os dados para o padrão do banco (snakes_case) para a API
            const payload: any = { 
                eventId,
                name: guestData.name,
                email: guestData.email,
                telefone: guestData.telefone,
                grupo: guestData.grupo,
                status: guestData.status,
                category: guestData.category,
                companions_list: guestData.companionsList, // No EventContext, as chaves têm CamelCase, mas passamos como snake para a API
                message: guestData.message
            }
            
            console.log(`[EventContext] Enviando atualização de convidado para ${id}:`, {
                eventId,
                guestId: id,
                status: guestData.status
            })

            // Chamar a API em vez de ir direto no banco (evita bloqueios de RLS no frontend)
            const res = await fetch(`/api/guests/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const responseData = await res.json()
            if (!res.ok) {
                console.error('[EventContext] Erro retornado pela API:', responseData)
                throw new Error(responseData.error || 'Erro ao persistir no servidor')
            }
            
            console.log(`[EventContext] Resposta da API:`, responseData)

            // Atualiza o estado local para garantir resposta imediata na UI
            setGuests(prev => prev.map(g => g.id === id ? { 
                ...g, 
                ...guestData, 
                updatedAt: now,
                confirmedAt: guestData.status === 'confirmed' 
                    ? (guestData.confirmedAt || now) 
                    : (guestData.status ? undefined : (guestData.confirmedAt || g.confirmedAt))
            } : g))
            
            console.log(`[EventContext] Convidado ${id} atualizado com sucesso via API.`)
        } catch (error) {
            console.error('Erro ao atualizar convidado via API:', error)
            throw error // Re-lança para o modal tratar e mostrar o toast
        }
    }, [eventId])

    const updateGuestStatus = useCallback(async (id: string, status: GuestStatus) => {
        try {
            await updateGuest(id, { status })
        } catch (error) {
            console.error('Erro ao atualizar status:', error)
            throw error // Re-lança para o chamador tratar
        }
    }, [updateGuest])

    const updateGuestCompanions = useCallback(async (id: string, companions: Companion[]) => {
        await updateGuest(id, { companionsList: companions })
    }, [updateGuest])

    const removeCompanion = useCallback(async (guestId: string, index: number) => {
        const guest = guests.find(g => g.id === guestId)
        if (!guest) return
        const newList = [...guest.companionsList]
        newList.splice(index, 1)
        await updateGuest(guestId, { companionsList: newList })
    }, [guests, updateGuest])

    const updateEventSettings = useCallback(async (newSettings: Partial<EventSettings>) => {
        if (!eventId) return
        const updatedSettings = { ...eventSettings, ...newSettings }

        // Atualiza no banco através do AdminContext
        await updateEvent(eventId, {
            eventSettings: updatedSettings,
            slug: updatedSettings.slug
        })

        // Atualiza estado local
        setEventSettings(updatedSettings)
    }, [eventId, eventSettings, updateEvent])

    const submitRSVP = useCallback(async (rsvpData: Omit<Guest, 'id' | 'updatedAt'>) => {
        if (!eventId) throw new Error('Evento não identificado')

        try {
            const now = new Date()
            const { error } = await supabase.from('guests').insert({
                event_id: eventId,
                name: rsvpData.name,
                email: rsvpData.email,
                telefone: rsvpData.telefone,
                grupo: rsvpData.grupo,
                status: 'confirmed',
                category: rsvpData.category,
                companions: rsvpData.companions,
                companions_list: rsvpData.companionsList,
                message: rsvpData.message || null,
                updated_at: now.toISOString(),
                confirmed_at: now.toISOString()
            })

            if (error) throw error

            // Opcional: Atualizar lista local se o admin estiver vendo
            const newGuest: Guest = {
                ...rsvpData,
                id: Math.random().toString(36).substr(2, 9), // ID temporário até refresh
                updatedAt: now,
                confirmedAt: now
            }
            setGuests(prev => [newGuest, ...prev])
        } catch (error) {
            console.error('Erro ao submeter RSVP:', error)
            throw error
        }
    }, [eventId])

    const value = useMemo(() => ({
        eventId,
        guests,
        eventSettings,
        ownerEmail,
        loading: loading || adminLoading,
        metrics,
        addGuest,
        addGuestsBatch,
        removeGuest,
        updateGuestStatus,
        updateGuest,
        updateGuestCompanions,
        removeCompanion,
        updateEventSettings,
        submitRSVP,
        refreshData
    }), [
        eventId,
        guests,
        eventSettings,
        ownerEmail,
        loading,
        adminLoading,
        metrics
    ])

    return (
        <EventContext.Provider value={value}>
            {children}
        </EventContext.Provider>
    )
}

export function useEvent() {
    const context = useContext(EventContext)
    if (!context) {
        throw new Error('useEvent deve ser usado dentro de EventProvider')
    }
    return context
}
