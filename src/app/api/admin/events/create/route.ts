import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyAuth } from '@/lib/auth-utils'

export async function POST(request: NextRequest) {
  try {
    // 🔒 Blindagem: Apenas administradores autenticados podem criar eventos nesta rota
    const isAuth = await verifyAuth(request, true)
    if (!isAuth) {
      return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 })
    }

    const { event } = await request.json()

    if (!event || !event.slug || !event.createdBy) {
      return NextResponse.json({ error: 'Dados do evento incompletos para criação.' }, { status: 400 })
    }

    console.log(`[ADMIN CREATE EVENT] Criando evento premium para: ${event.createdBy} - Slug: ${event.slug}`)

    // 1. Verificar se o slug já existe (Busca com Service Role para ver tudo)
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('slug')
      .eq('slug', event.slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ 
        error: 'Slug já ocupado', 
        details: `A URL "/${event.slug}" já está em uso. Por favor, escolha outra.` 
      }, { status: 409 })
    }

    // 2. Inserir o novo evento ignorando RLS
    const { error: insertError } = await supabaseAdmin
      .from('events')
      .insert({
        id: event.id,
        slug: event.slug,
        event_settings: event.eventSettings,
        created_at: event.createdAt,
        created_by: event.createdBy
      })

    if (insertError) {
      console.error('[ADMIN CREATE EVENT ERROR SC]:', insertError)
      throw insertError
    }

    console.log(`[ADMIN CREATE EVENT] Evento ${event.slug} criado com sucesso.`)

    return NextResponse.json({ success: true, message: 'Evento criado com sucesso via Admin API.' })
  } catch (error: any) {
    console.error('[ADMIN CREATE EVENT EXCEPTION]:', error)
    return NextResponse.json({ 
      error: 'Erro ao criar evento via servidor', 
      details: error.message 
    }, { status: 500 })
  }
}
