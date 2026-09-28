import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyEventOwnership } from '@/lib/verify-ownership';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const eventId = params.id;

        // 🔒 Verificar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId)
        if (!ownership.authorized) return ownership.response

        // 📝 Buscar todos os dados em paralelo para máxima performance
        const [
            { data: event, error: eventError },
            { data: gifts },
            { data: transactions },
            { data: withdrawals },
            { data: rsvpMessages }
        ] = await Promise.all([
            supabaseAdmin
                .from('events')
                .select('id, slug, gift_list_enabled, tax_payer, bank_pix_key, bank_type, bank_beneficiary, event_settings')
                .eq('id', eventId)
                .single(),
            supabaseAdmin
                .from('gifts')
                .select('id, name, description, price, image_url, category, subcategory, active, order, is_quota, quantity')
                .eq('event_id', eventId)
                .order('order', { ascending: true }),
            supabaseAdmin
                .from('gift_transactions')
                .select('id, guest_name, guest_email, amount_bruto, amount_net, amount_fee, message, created_at, status, release_date')
                .eq('event_id', eventId)
                .eq('status', 'APPROVED')
                .order('created_at', { ascending: false }),
            supabaseAdmin
                .from('withdrawals')
                .select(`
                    id, amount, status, requested_at, pix_key, receipt_url, rejection_reason,
                    gift_transactions (id, guest_name, amount_bruto, amount_net)
                `)
                .eq('event_id', eventId),
            supabaseAdmin
                .from('guests')
                .select('id, name, message, confirmed_at')
                .eq('event_id', eventId)
                .not('message', 'is', null)
                .neq('message', '')
                .order('confirmed_at', { ascending: false })
        ]);

        if (eventError || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const now = new Date();
        const stats = (transactions || []).reduce((acc: any, t: any) => {
            const net = Number(t.amount_net || 0);
            acc.totalNet += net;
            if (t.release_date && new Date(t.release_date) > now) {
                acc.pendingNet += net;
            } else {
                acc.availableNet += net;
            }
            return acc;
        }, { totalNet: 0, pendingNet: 0, availableNet: 0 });

        const totalWithdrawn = (withdrawals || [])
            .filter((w: any) => {
                const st = (w.status || 'pending').toUpperCase();
                return st === 'COMPLETED' || st === 'PENDING';
            })
            .reduce((acc: any, w: any) => acc + Number(w.amount || 0), 0);

        stats.availableNet = Math.max(0, Math.round((stats.availableNet - totalWithdrawn) * 100) / 100);
        stats.totalNet = Math.round(stats.totalNet * 100) / 100;
        stats.pendingNet = Math.round(stats.pendingNet * 100) / 100;

        // Combinar transações de presentes com recados do RSVP
        // Só inclui presentes que possuam mensagem real (não excluídas do mural)
        const giftMessages = (transactions || [])
            .filter((t: any) => t.message !== null && t.message !== undefined && t.message !== '')
            .map((t: any) => ({
            id: t.id,
            guestName: t.guest_name,
            message: t.message,
            type: 'gift',
            createdAt: t.created_at
        }));

        const directMessages = (rsvpMessages || []).map(m => ({
            id: m.id,
            guestName: m.name,
            message: m.message,
            type: 'rsvp',
            createdAt: m.confirmed_at
        }));

        const allMessages = [...giftMessages, ...directMessages].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        const formattedTransactions = (transactions || []).map((t: any) => ({
             id: t.id,
             guestName: t.guest_name,
             guestEmail: t.guest_email,
             amount: Number(t.amount_bruto || t.amount || t.amount_net || 0),
             amountNet: Number(t.amount_net || 0),
             message: t.message,
             createdAt: t.created_at
        }));

        return NextResponse.json({
            gifts: gifts || [],
            stats,
            settings: {
                giftListEnabled: event.gift_list_enabled || false,
                taxPayer: event.tax_payer || 'COUPLE',
                slug: event.slug || '',
                bankPixKey: event.bank_pix_key || '',
                bankType: event.bank_type || 'CPF',
                bankBeneficiary: event.bank_beneficiary || '',
                coupleNames: typeof event.event_settings === 'string' ? JSON.parse(event.event_settings).coupleNames : event.event_settings?.coupleNames || 'Nós',
                serviceTax: event.event_settings?.serviceTax || 5.49
            },
            transactions: formattedTransactions, // Para a aba da Tesouraria
            messages: allMessages.slice(0, 100), // Para o Mural
            withdrawals: (withdrawals || []).map(w => ({
                id: w.id,
                amount: Number(w.amount),
                status: (w.status || 'PENDING').toUpperCase(),
                createdAt: w.requested_at,
                pixKey: w.pix_key,
                receiptUrl: w.receipt_url,
                rejectionReason: w.rejection_reason,
                gifts: (w.gift_transactions || []).map((t: any) => ({
                    id: t.id,
                    guestName: t.guest_name,
                    amount: Number(t.amount_bruto || t.amount || t.amount_net || 0),
                    amountNet: Number(t.amount_net || 0)
                }))
            }))
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            }
        });

    } catch (e) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const eventId = params.id;
        const ownership = await verifyEventOwnership(req, eventId);
        if (!ownership.authorized) return ownership.response;

        const body = await req.json();
        
        const { data: existingGifts } = await supabaseAdmin
            .from('gifts')
            .select('order')
            .eq('event_id', eventId)
            .order('order', { ascending: false })
            .limit(1);
            
        const nextOrder = existingGifts?.length ? (existingGifts[0].order || 0) + 1 : 1;

        const qty = Math.max(1, parseInt(body.quantity, 10) || 1);
        const { data, error } = await supabaseAdmin
            .from('gifts')
            .insert({
                event_id: eventId,
                name: String(body.name || '').trim(),
                description: String(body.description || '').trim(),
                price: Math.max(0, Number(body.price) || 0),
                image_url: body.imageUrl,
                category: body.category,
                subcategory: 'custom',
                is_quota: Boolean(body.isQuota !== undefined ? body.isQuota : qty > 1),
                quantity: qty,
                active: body.active !== undefined ? body.active : true,
                order: nextOrder,
                is_custom: true
            })
            .select('*')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: 'Erro interno ao salvar o presente. A imagem pode ser muito grande.' }, { status: 500 });
    }
}
