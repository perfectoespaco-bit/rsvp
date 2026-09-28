'use client'

import { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react'
import { EventSettings, Guest } from './event-context'
import { useAuth } from './auth-context'
import { supabase } from './supabase'
import { toast } from 'sonner'

export type UserType = 'admin' | 'noivos'

export type AdminUser = {
  id: string
  name: string
  email: string
  type: UserType
  eventsCount: number
  createdAt: Date
  events?: string[]
}

export type AdminEvent = {
  id: string
  slug: string
  eventSettings: EventSettings
  guests: Guest[]
  createdAt: Date
  createdBy: string
}

type AdminContextType = {
  events: AdminEvent[]
  users: AdminUser[]
  loading: boolean
  addEvent: (event: AdminEvent) => Promise<void>
  removeEvent: (id: string) => Promise<void>
  updateEvent: (id: string, event: Partial<AdminEvent>) => Promise<void>
  addUser: (user: AdminUser) => Promise<void>
  removeUser: (id: string) => Promise<void>
  updateUser: (id: string, user: Partial<AdminUser>) => Promise<void>
  getEventById: (id: string) => AdminEvent | undefined
  getTotalMetrics: () => {
    totalEvents: number
    totalCouples: number
    totalGuests: number
    totalConfirmed: number
    totalPending: number
    confirmationRate: number
  }
  metrics: {
    pendingWithdrawals: number
    newUsers: number
    upcomingEvents: number
    totalRevenue: number
    transactionHistory: any[]
    anomalies: any[]
  } | null
  fetchMetrics: () => Promise<void>
  createDefaultEventForUser: (userEmail: string, userName: string, coupleNames?: string, customSlug?: string) => Promise<void>
}

const AdminContext = createContext<AdminContextType | undefined>(undefined)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const { user } = useAuth()

  // Carrega dados iniciais do Supabase de forma protegida
  useEffect(() => {
    async function loadData() {
      // Nota: Sempre carregamos Eventos (são públicos por slug)
      // Mas usuários e métricas globais dependem de quem está logado.
      setLoading(true)
      try {
        let eventsQuery = supabase.from('events').select('id, slug, event_settings, notification_settings, created_at, created_by, gift_list_enabled')
        let usersQuery = supabase.from('admin_users').select('id, name, email, type, created_at')

        // Se for NOIVOS, filtragem de isolamento:
        if (user && user.role !== 'admin') {
          eventsQuery = eventsQuery.eq('created_by', user.email)
          usersQuery = usersQuery.eq('email', user.email)
        } else if (!user) {
          // Público: Não carregamos lista de usuários
          usersQuery = usersQuery.eq('id', 'none')
        }

        const [{ data: eventsData, error: eventsError }, { data: usersData, error: usersError }] = await Promise.all([
          eventsQuery.order('created_at', { ascending: false }),
          usersQuery.order('created_at', { ascending: false })
        ])

        if (eventsError) throw eventsError
        if (usersError) throw usersError

        const formattedEvents = (eventsData || []).map(e => {
          const settings = (e.event_settings as any) || {}
          return {
            id: e.id,
            slug: e.slug,
            eventSettings: {
              ...settings,
              isGiftListEnabled: settings.isGiftListEnabled ?? true, // Master Switch
              giftListInternalEnabled: e.gift_list_enabled ?? false, // Column Switch
              notificationSettings: e.notification_settings || settings.notificationSettings || {
                rsvp: true,
                gifts: true,
                mural: true,
                withdrawals: true
              }
            },
            guests: [],
            createdAt: new Date(e.created_at),
            createdBy: e.created_by
          }
        })

        // Mapear contagem de eventos
        const eventCounts: Record<string, number> = {}
        formattedEvents.forEach(e => {
          if (e.createdBy) {
            const email = e.createdBy.toLowerCase()
            eventCounts[email] = (eventCounts[email] || 0) + 1
          }
        })

        const formattedUsers = (usersData || []).map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          type: u.type,
          eventsCount: eventCounts[u.email.toLowerCase()] || 0,
          createdAt: new Date(u.created_at)
        }))

        setEvents(formattedEvents)
        setUsers(formattedUsers)
      } catch (error) {
        console.error('Erro ao carregar dados do Supabase:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user])

  async function addEvent(event: AdminEvent) {
    try {
      // 🔥 Chamada via API do Servidor (Service Role) para contornar RLS na criação
      const response = await fetch('/api/admin/events/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          event: {
            ...event,
            createdAt: event.createdAt.toISOString()
          } 
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.details || errData.error || 'Erro persistindo evento no servidor')
      }

      // Se persistiu no servidor, atualiza o estado local
      setEvents(prev => [event, ...prev])
      console.log(`Evento ${event.slug} persistido com sucesso via Admin API.`)
    } catch (error: any) {
      console.error('Erro ao adicionar evento CRÍTICO:', error)
      throw error // Repassar erro para o chamador (UsersManagement)
    }
  }

  async function removeEvent(id: string) {
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao remover evento')
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch (error) {
      console.error('Erro ao remover evento:', error)
      toast.error('Erro ao remover evento')
    }
  }

  async function updateEvent(id: string, eventData: Partial<AdminEvent>) {
    try {
      const updates: any = {}
      if (eventData.slug) updates.slug = eventData.slug
      if (eventData.eventSettings) {
        updates.event_settings = eventData.eventSettings
        // Sync root column if present in settings object
        if (eventData.eventSettings.giftListInternalEnabled !== undefined) {
          updates.gift_list_enabled = eventData.eventSettings.giftListInternalEnabled
        }
        if (eventData.eventSettings.notificationSettings !== undefined) {
          updates.notification_settings = eventData.eventSettings.notificationSettings
        }
      }

      // 🔄 Chamada via API para contornar RLS
      const response = await fetch(`/api/events/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, updates }),
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json()
          throw new Error(errData.error || 'Erro ao persistir no servidor')
        } else {
          throw new Error(`Servidor retornou erro ${response.status}: ${response.statusText}`)
        }
      }

      // 🛠️ Se persistiu no servidor, atualiza o estado local
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...eventData } : e))

      // Se o slug mudou, atualizar também no eventSettings local
      if (eventData.slug) {
        setEvents(prev => prev.map(e => e.id === id ? {
          ...e,
          eventSettings: { ...e.eventSettings, slug: eventData.slug! }
        } : e))
      }
    } catch (error) {
      console.error('Erro ao atualizar evento:', error)
      throw error
    }
  }

  async function addUser(user: AdminUser & { password_hash?: string }) {
    try {
      const { error } = await supabase.from('admin_users').insert({
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type,
        password_hash: user.password_hash || null,
        created_at: user.createdAt.toISOString()
      })
      if (error) throw error
      setUsers(prev => [user, ...prev])
    } catch (error) {
      console.error('Erro ao adicionar usuário CRÍTICO:', error)
      throw error // Repassar erro para o chamador
    }
  }

  async function removeUser(id: string) {
    try {
      // Buscar o usuário antes para ter o email
      const userToRemove = users.find(u => u.id === id)
      if (!userToRemove) return

      // 🔥 Chamada via API do Servidor (Service Role) para contornar RLS
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: id, 
          userEmail: userToRemove.email 
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Erro ao persistir exclusão no servidor')
      }

      // Após sucesso no banco, limpamos o estado local
      setUsers(prev => prev.filter(u => u.id !== id))
      // Remover também eventos vinculados ao email do estado local
      setEvents(prev => prev.filter(e => e.createdBy?.toLowerCase() !== userToRemove.email.toLowerCase()))

      toast.success('Acesso e dados removidos permanentemente. 🎉')
    } catch (error: any) {
      console.error('Erro ao remover usuário e dados vinculados:', error)
      toast.error('Erro crítico na exclusão', { description: error.message || 'Contate o suporte técnico.' })
      throw error
    }
  }

  async function updateUser(id: string, userData: Partial<AdminUser>) {
    try {
      const updates: any = {}
      if (userData.name) updates.name = userData.name
      if (userData.email) updates.email = userData.email
      if (userData.type) updates.type = userData.type

      const { error } = await supabase.from('admin_users').update(updates).eq('id', id)
      if (error) throw error

      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u))
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error)
    }
  }

  async function fetchMetrics() {
    try {
      const response = await fetch('/api/admin/metrics')
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      }
    } catch (error) {
      console.error('Error fetching admin metrics:', error)
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchMetrics()
    }
  }, [user])

  function getEventById(id: string) {
    return events.find(e => e.id === id)
  }

  function getTotalMetrics() {
    let totalEvents = events.length
    let totalCouples = totalEvents
    let totalGuests = 0
    let totalConfirmed = 0
    let totalPending = 0

    // Nota: Como os convidados agora estão no Supabase, as métricas totais no AdminContext
    // podem precisar de uma query separada se quisermos precisão total sem carregar tudo.
    // Por enquanto, vou manter a lógica de loop, mas saiba que e.guests pode estar vazio aqui.
    events.forEach(event => {
      let eventGuests = event.guests || []
      eventGuests.forEach((guest: Guest) => {
        const count = 1 + (guest.companionsList?.length || 0)
        totalGuests += count

        if (guest.status === 'confirmed') {
          const cC = guest.companionsList ? guest.companionsList.filter((c: any) => c.isConfirmed).length : 0
          totalConfirmed += 1 + cC
        } else if (guest.status === 'pending') {
          const uC = guest.companionsList ? guest.companionsList.filter((c: any) => !c.isConfirmed).length : 0
          totalPending += 1 + uC
        }
      })
    })

    const confirmationRate = totalGuests > 0 ? Math.round((totalConfirmed / totalGuests) * 100) : 0

    return {
      totalEvents,
      totalCouples,
      totalGuests,
      totalConfirmed,
      totalPending,
      confirmationRate
    }
  }

  async function createDefaultEventForUser(userEmail: string, userName: string, coupleNames?: string, customSlug?: string) {
    try {
      const eventId = crypto.randomUUID()
      let finalSlug = customSlug || (coupleNames || userName).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      // Se for slug automático, adicionamos um sufixo inicial para evitar conflitos óbvios
      if (!customSlug) {
        finalSlug += '-' + Math.random().toString(36).substring(2, 6)
      }

      // 1. Verificar se o slug já existe
      const { data: existing } = await supabase
        .from('events')
        .select('slug')
        .eq('slug', finalSlug)
        .maybeSingle()

      if (existing) {
        throw new Error(`A URL "/${finalSlug}" já está sendo usada por outro evento no banco de dados. Verifique a tabela de eventos.`)
      }

      const newEvent: AdminEvent = {
        id: eventId,
        slug: finalSlug,
        eventSettings: {
          coupleNames: coupleNames || userName,
          slug: finalSlug,
          eventType: 'casamento',
          eventDate: new Date().toISOString().split('T')[0],
          eventTime: '19:00',
          confirmationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          eventLocation: 'Espaço e Buffet - Endereço',
          coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=2069&auto=format&fit=crop',
          coverImagePosition: 50,
          coverImageScale: 1.0,
          customMessage: 'Ficamos muito felizes em receber a sua confirmação de presença.',
          isGiftListEnabled: false
        },
        guests: [],
        createdAt: new Date(),
        createdBy: userEmail
      }

      await addEvent(newEvent)

      // Atualizar contagem no estado local se o usuário já estiver listado
      setUsers(prev => prev.map(u => u.email.toLowerCase() === userEmail.toLowerCase() ? { ...u, eventsCount: 1 } : u))
    } catch (error) {
      console.error('Erro ao criar evento padrão:', error)
      throw error // Repassar para o componente tratar
    }
  }

  const value = useMemo(() => ({
    events,
    users,
    loading,
    addEvent,
    removeEvent,
    updateEvent,
    addUser,
    removeUser,
    updateUser,
    getEventById,
    getTotalMetrics,
    createDefaultEventForUser,
    metrics,
    fetchMetrics
  }), [events, users, loading, metrics])

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin deve ser usado dentro de AdminProvider')
  }
  return context
}
