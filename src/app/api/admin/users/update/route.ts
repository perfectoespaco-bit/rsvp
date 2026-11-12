import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyAuth } from '@/lib/auth-utils'

export async function POST(request: NextRequest) {
  try {
    // 🔒 Blindagem: Apenas administradores autenticados podem atualizar usuários
    const isAuth = await verifyAuth(request, true)
    if (!isAuth) {
      return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 })
    }

    const { id, userData } = await request.json()

    if (!id || !userData) {
      return NextResponse.json({ error: 'ID e dados de atualização são obrigatórios.' }, { status: 400 })
    }

    const updates: any = {}
    if (userData.name) updates.name = userData.name
    if (userData.email) updates.email = userData.email.toLowerCase().trim()
    if (userData.type) updates.type = userData.type

    const { error } = await supabaseAdmin
      .from('admin_users')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error('[ADMIN UPDATE USER ERROR]:', error)
      throw error
    }

    console.log(`[ADMIN UPDATE USER] Usuário ${id} atualizado com sucesso via Service Role.`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ADMIN UPDATE USER EXCEPTION]:', error)
    return NextResponse.json({ error: error.message || 'Erro ao atualizar usuário' }, { status: 500 })
  }
}
