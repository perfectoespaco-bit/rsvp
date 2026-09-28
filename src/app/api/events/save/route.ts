import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyEventOwnership } from '@/lib/verify-ownership'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID do evento é obrigatório' }, { status: 400 })
    }

    // 🔒 Blindagem: Validar se quem está salvando é o dono do evento ou admin
    const ownership = await verifyEventOwnership(request, id)
    if (!ownership.authorized) {
      return ownership.response
    }

    // Usando o supabaseAdmin para contornar RLS
    const { data, error } = await supabaseAdmin
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) {
      console.error('❌ Erro no Supabase ao atualizar evento:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      console.error('❌ Nenhuma linha atualizada. Possível falha de RLS ou ID do evento não encontrado.')
      return NextResponse.json({ error: 'Falha ao salvar. Nenhuma linha atualizada no banco.' }, { status: 403 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('❌ Erro na API de Eventos:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
