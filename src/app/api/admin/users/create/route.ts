import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyAuth } from '@/lib/auth-utils'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    // 🔒 Blindagem: Apenas administradores autenticados podem criar novos usuários
    const isAuth = await verifyAuth(request, true)
    if (!isAuth) {
      return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 })
    }

    const { user } = await request.json()

    if (!user || !user.email || !user.name) {
      return NextResponse.json({ error: 'Dados incompletos para criação de usuário.' }, { status: 400 })
    }

    // Verificar se o usuário já existe
    const { data: existingUser } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', user.email.toLowerCase().trim())
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ 
        error: 'Usuário já cadastrado!', 
        details: 'Este e-mail já possui acesso ao sistema.',
        code: '23505'
      }, { status: 409 })
    }

    // Criptografar senha se foi passada como texto plano
    let passwordHash = user.password_hash || null
    if (passwordHash && !passwordHash.startsWith('$2')) {
      passwordHash = await bcrypt.hash(passwordHash, 10)
    }

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .insert({
        id: user.id || crypto.randomUUID(),
        name: user.name,
        email: user.email.toLowerCase().trim(),
        type: user.type || 'noivos',
        password_hash: passwordHash,
        created_at: user.createdAt || new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('[ADMIN CREATE USER ERROR]:', error)
      throw error
    }

    console.log(`[ADMIN CREATE USER] Usuário ${user.email} criado com sucesso via Service Role.`)

    return NextResponse.json({ success: true, user: data })
  } catch (error: any) {
    console.error('[ADMIN CREATE USER EXCEPTION]:', error)
    return NextResponse.json({ 
      error: error.message || 'Erro ao criar usuário no banco de dados',
      details: error.details,
      code: error.code
    }, { status: 500 })
  }
}
