import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyEventOwnership } from '@/lib/verify-ownership'

/**
 * API para atualizar dados de um convidado.
 * Fazemos no servidor para garantir bypass de RLS via cookies de sessão se necessário
 * ou para facilitar o log de erros reais.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const guestId = params.id
        const body = await req.json()
        const { eventId, ...updates } = body

        if (!eventId) {
            return NextResponse.json({ error: 'ID do evento é obrigatório para validação' }, { status: 400 })
        }

        // 🔒 Verificar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId)
        if (!ownership.authorized) {
            return ownership.response
        }

        console.log('[GUEST UPDATE] Request:', { guestId, eventId, updatesCount: Object.keys(updates).length })

        // No banco, a coluna é snakes_case (ex: companions_list, updated_at, confirmed_at)
        // O body já deve vir formatado ou convertemos aqui.
        // Como o EventContext já formata em snakes_case antes de enviar (no meu plano),
        // vamos garantir a conformidade:
        const payload: any = {}
        
        if (updates.name !== undefined) payload.name = updates.name
        if (updates.email !== undefined) payload.email = updates.email
        if (updates.telefone !== undefined) payload.telefone = updates.telefone
        if (updates.grupo !== undefined) payload.grupo = updates.grupo
        if (updates.status !== undefined) {
            payload.status = updates.status
            // Usar string pura para o banco
            if (updates.status === 'confirmed') {
                payload.confirmed_at = new Date().toISOString()
            } else {
                payload.confirmed_at = null
            }
        }
        if (updates.category !== undefined) payload.category = updates.category
        if (updates.companions_list !== undefined) {
            payload.companions_list = updates.companions_list
        }
        if (updates.message !== undefined) payload.message = updates.message

        console.log('[GUEST UPDATE] Final payload:', JSON.stringify(payload))
        console.log('[GUEST UPDATE] Target ID:', guestId)

        // Executar o update estritamente escopado ao evento
        const { data, error } = await supabaseAdmin
            .from('guests')
            .update(payload)
            .eq('id', guestId)
            .eq('event_id', eventId)
            .select() 

        if (error) {
            console.error('[GUEST UPDATE] Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!data || data.length === 0) {
            console.warn('[GUEST UPDATE] No rows affected. Check if ID and EventID are correct:', { guestId, eventId })
            return NextResponse.json({ 
                error: 'Nenhum registro encontrado para atualizar. O ID ou EventID podem estar incorretos.',
                debug: { guestId, eventId }
            }, { status: 404 })
        }

        console.log('[GUEST UPDATE] Success! Rows affected:', data.length)
        return NextResponse.json({ ok: true, updated: data[0] })
        
    } catch (error: any) {
        console.error('[GUEST UPDATE ERROR]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * DELETE: Remover um convidado (Hard Delete)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const guestId = params.id
        const { searchParams } = new URL(req.url)
        const eventId = searchParams.get('eventId')

        if (!eventId) {
            return NextResponse.json({ error: 'eventId é obrigatório' }, { status: 400 })
        }

        // 🔒 Verificar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId)
        if (!ownership.authorized) return ownership.response

        const { error } = await supabaseAdmin
            .from('guests')
            .delete()
            .eq('id', guestId)
            .eq('event_id', eventId)

        if (error) {
            console.error('[GUEST DELETE] Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
    } catch (error: any) {
        console.error('[GUEST DELETE ERROR]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
