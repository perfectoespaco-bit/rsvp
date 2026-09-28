import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyEventOwnership } from '@/lib/verify-ownership';
import { GIFT_TEMPLATES } from '@/lib/gift-templates';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const eventId = params.id;

        // 🔒 Blindagem: Validar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId);
        if (!ownership.authorized) return ownership.response;

        const { category, subcategory, items } = await req.json();

        // Se vieram itens específicos do preview, usá-los diretamente
        const templates = items && Array.isArray(items) && items.length > 0
            ? items
            : GIFT_TEMPLATES.filter(t => {
                const matchCategory = t.category === category;
                const matchSubcategory = subcategory ? t.subcategory === subcategory : true;
                return matchCategory && matchSubcategory;
            });

        if (templates.length === 0) {
            return NextResponse.json({ error: 'Nenhum presente encontrado para esta seleção' }, { status: 400 });
        }

        // Criar presentes em lote para o evento
        const inserts = templates.map((t: any, index: number) => {
            const qty = Math.max(1, parseInt(t.quantity, 10) || 1);
            return {
                event_id: eventId,
                name: String(t.name || '').trim(),
                description: String(t.description || '').trim(),
                price: Math.max(0, Number(t.price) || 0),
                category: t.category,
                subcategory: t.subcategory,
                image_url: t.imageUrl,
                is_quota: Boolean(t.isQuota || qty > 1),
                quantity: qty,
                active: true,
                is_custom: false,
                order: index
            };
        });

        const { error } = await supabaseAdmin.from('gifts').insert(inserts);

        if (error) {
            console.error('[GIFT IMPORT] Supabase error:', JSON.stringify(error));
            return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 500 });
        }

        return NextResponse.json({ ok: true, count: templates.length });

    } catch (e: any) {
        console.error('[GIFT IMPORT] Exception:', e);
        return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 });
    }
}
