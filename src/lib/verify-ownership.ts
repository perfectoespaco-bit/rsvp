import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { decrypt } from './auth-utils'

/**
 * Verifica se o usuário logado (lido do cookie rsvp_session assinado) é dono do evento.
 * Retorna { authorized: true } se for admin ou se o evento pertencer ao email logado.
 * Retorna { authorized: false, response } com o NextResponse de erro em caso contrário.
 */
export async function verifyEventOwnership(
    req: NextRequest,
    eventId: string
): Promise<{ authorized: true } | { authorized: false; response: NextResponse }> {

    const sessionCookie = req.cookies.get('rsvp_session')

    if (!sessionCookie?.value) {
        return {
            authorized: false,
            response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }
    }

    let session: { email?: string; role?: string }
    try {
        session = await decrypt(sessionCookie.value)
    } catch (err) {
        return {
            authorized: false,
            response: NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })
        }
    }

    // Administrador tem acesso total
    if (session.role === 'admin') {
        return { authorized: true }
    }

    // Usuário normal: verificar se é dono do evento
    if (!session.email) {
        return {
            authorized: false,
            response: NextResponse.json({ error: 'Sem email na sessão' }, { status: 401 })
        }
    }

    const { data: event, error } = await supabaseAdmin
        .from('events')
        .select('created_by')
        .eq('id', eventId)
        .single()

    if (error || !event) {
        return {
            authorized: false,
            response: NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
        }
    }

    // Comparar o campo created_by com o email do usuário logado (case-insensitive)
    const isOwner = event.created_by?.toLowerCase() === session.email.toLowerCase()

    if (!isOwner) {
        return {
            authorized: false,
            response: NextResponse.json({ error: 'Acesso negado: você não tem permissão para este evento' }, { status: 403 })
        }
    }

    return { authorized: true }
}
