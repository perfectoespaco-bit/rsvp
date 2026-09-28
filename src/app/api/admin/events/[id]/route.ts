import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth-utils';

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 🔒 Blindagem: Apenas administradores autenticados podem excluir eventos
        const isAuth = await verifyAuth(req, true);
        if (!isAuth) {
            return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 });
        }

        const eventId = params.id;
        if (!eventId) {
            return NextResponse.json({ error: 'ID do evento é obrigatório' }, { status: 400 });
        }

        // Limpar tabelas relacionadas em cascata segura
        await Promise.allSettled([
            supabaseAdmin.from('guests').delete().eq('event_id', eventId),
            supabaseAdmin.from('gifts').delete().eq('event_id', eventId),
            supabaseAdmin.from('mural').delete().eq('event_id', eventId),
            supabaseAdmin.from('gift_transactions').delete().eq('event_id', eventId),
            supabaseAdmin.from('withdrawals').delete().eq('event_id', eventId)
        ]);

        const { error } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;

        return NextResponse.json({ ok: true, message: 'Evento excluído com sucesso.' });
    } catch (e: any) {
        console.error('[ADMIN DELETE EVENT ERROR]', e);
        return NextResponse.json({ error: e.message || 'Erro ao excluir evento' }, { status: 500 });
    }
}
