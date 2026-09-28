import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyEventOwnership } from '@/lib/verify-ownership'

/**
 * POST /api/guests
 * Cria convidados (individual ou em lote) com validação de propriedade do evento no servidor.
 * Bypassa bloqueios de RLS de inserção anônima de forma segura.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { eventId, guest, guests } = body

        if (!eventId) {
            return NextResponse.json({ error: 'ID do evento é obrigatório' }, { status: 400 })
        }

        // 🔒 Verificar propriedade do evento (somente o dono do evento ou admin pode cadastrar convidados)
        const ownership = await verifyEventOwnership(req, eventId)
        if (!ownership.authorized) {
            return ownership.response
        }

        const now = new Date().toISOString()
        const rawList = guests && Array.isArray(guests) ? guests : (guest ? [guest] : [])

        if (rawList.length === 0) {
            return NextResponse.json({ error: 'Nenhum convidado fornecido para cadastro' }, { status: 400 })
        }

        const inserts = rawList.map((g: any) => {
            const newId = g.id && typeof g.id === 'string' && g.id.length > 0
                ? g.id
                : Math.random().toString(36).substr(2, 9)

            const companions = g.companions_list || g.companionsList || []

            return {
                id: newId,
                event_id: eventId,
                name: String(g.name || '').trim(),
                email: String(g.email || '').trim(),
                telefone: String(g.telefone || '').trim(),
                grupo: String(g.grupo || '').trim(),
                status: g.status || 'pending',
                category: g.category || 'adult_paying',
                companions_list: Array.isArray(companions) ? companions : [],
                updated_at: now
            }
        })

        console.log(`[API /api/guests] Inserindo ${inserts.length} convidado(s) para evento ${eventId}`)

        const { data, error } = await supabaseAdmin
            .from('guests')
            .insert(inserts)
            .select()

        if (error) {
            console.error('[API /api/guests] Erro no Supabase:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ 
            ok: true, 
            count: data?.length || inserts.length,
            guests: data 
        })

    } catch (error: any) {
        console.error('[API /api/guests] Exceção:', error)
        return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 })
    }
}
