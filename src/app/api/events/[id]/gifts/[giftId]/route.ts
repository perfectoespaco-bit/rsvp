import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyEventOwnership } from '@/lib/verify-ownership';

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string, giftId: string } }
) {
    try {
        const eventId = params.id;
        const giftId = params.giftId;

        // 🔒 Blindagem: Validar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId);
        if (!ownership.authorized) return ownership.response;

        const { error } = await supabaseAdmin
            .from('gifts')
            .delete()
            .eq('id', giftId)
            .eq('event_id', eventId);

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: 'Erro ao excluir item' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string, giftId: string } }
) {
    try {
        const eventId = params.id;
        const giftId = params.giftId;

        // 🔒 Blindagem: Validar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId);
        if (!ownership.authorized) return ownership.response;

        const body = await req.json();

        // Limpar dados para o Supabase
        const updateData: any = {};
        if (body.name !== undefined) updateData.name = String(body.name).trim();
        if (body.description !== undefined) updateData.description = String(body.description).trim();
        if (body.price !== undefined) updateData.price = Math.max(0, Number(body.price));
        if (body.quantity !== undefined) {
            const qty = Math.max(1, parseInt(body.quantity, 10) || 1);
            updateData.quantity = qty;
            updateData.is_quota = Boolean(body.isQuota !== undefined ? body.isQuota : qty > 1);
        } else if (body.isQuota !== undefined) {
            updateData.is_quota = Boolean(body.isQuota);
        }
        if (body.active !== undefined) updateData.active = Boolean(body.active);
        if (body.imageUrl !== undefined) updateData.image_url = body.imageUrl;
        if (body.category !== undefined) updateData.category = body.category;

        const { error } = await supabaseAdmin
            .from('gifts')
            .update(updateData)
            .eq('id', giftId)
            .eq('event_id', eventId);

        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('Update Gift Error:', e);
        return NextResponse.json({ error: 'Erro ao atualizar presente' }, { status: 500 });
    }
}
