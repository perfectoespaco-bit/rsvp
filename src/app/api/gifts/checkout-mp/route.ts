import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
    try {
        const { cart, guestName, email, message, eventId } = await req.json();

        if (!guestName) {
            return NextResponse.json({ error: 'Nome do convidado é obrigatório' }, { status: 400 });
        }
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
        }

        // 1. Fetch gifts and event data
        const giftIds = cart.map(item => item.id);
        const { data: giftsData, error: giftsError } = await supabaseAdmin
            .from('gifts')
            .select('*, events(*)')
            .in('id', giftIds);

        if (giftsError || !giftsData || giftsData.length === 0) {
            return NextResponse.json({ error: 'Presentes não encontrados' }, { status: 404 });
        }

        const firstGift = giftsData[0];
        const settings = typeof firstGift.events.event_settings === 'string'
            ? JSON.parse(firstGift.events.event_settings)
            : firstGift.events.event_settings;
            
        const feePercent = settings?.serviceTax ? Number(settings.serviceTax) / 100 : 0.0549;
        const taxPayer = firstGift.events.tax_payer || 'COUPLE';

        let totalAmoutBruto = 0;
        let totalAmountFee = 0;
        let totalAmountNet = 0;
        const itemNames = [];
        const itemsForDb = [];

        for (const cartItem of cart) {
            const gift = giftsData.find(g => g.id === cartItem.id);
            if (!gift) continue;

            const quantity = cartItem.quantity || 1;
            const price = Number(gift.price);
            itemNames.push(`${quantity}x ${gift.name}`);

            let amountBruto = price;
            let amountFee = price * feePercent;
            let amountNet = price - amountFee;

            if (taxPayer === 'GUEST') {
                amountBruto = price * (1 + feePercent);
                amountFee = amountBruto - price;
                amountNet = price;
            }

            totalAmoutBruto += amountBruto * quantity;
            totalAmountFee += amountFee * quantity;
            totalAmountNet += amountNet * quantity;

            itemsForDb.push({
                id: gift.id,
                name: gift.name,
                price: price,
                quantity: quantity
            });
        }

        // 2. Criar registro de transação PENDENTE no banco
        const cleanGuestName = String(guestName || 'Convidado').replace(/<[^>]*>/g, '').trim().slice(0, 150);
        const cleanMessage = String(message || '').replace(/<[^>]*>/g, '').trim().slice(0, 1000);

        const { data: tx, error: txError } = await supabaseAdmin
            .from('gift_transactions')
            .insert({
                gift_id: firstGift.id,
                event_id: firstGift.event_id,
                guest_name: cleanGuestName,
                guest_email: email ? String(email).trim().slice(0, 150) : null,
                message: `Carrinho: ${itemNames.join(', ')}. ${cleanMessage}`,
                amount_bruto: totalAmoutBruto,
                amount_gross: totalAmoutBruto,
                amount_fee: totalAmountFee,
                amount_net: totalAmountNet,
                tax_payer: taxPayer,
                status: 'PENDING',
                payment_method: 'PIX_MP',
                items: itemsForDb
            })
            .select()
            .single();

        if (txError) {
            console.error('DB insert error:', txError);
            throw new Error(`Erro ao salvar transação: ${txError.message}`);
        }

        let baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/['"]+/g, '').trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

        // 3. Criar Payment PIX diretamente
        const paymentBody = {
            transaction_amount: Number(totalAmoutBruto.toFixed(2)),
            description: `Lista de Presentes: ${itemNames.length} itens - De ${guestName}`,
            payment_method_id: 'pix',
            external_reference: tx.id,
            notification_url: `${baseUrl}/api/webhook/mercadopago`,
            payer: {
                email: email || 'convidado@rsvp.com.br',
                first_name: guestName.split(' ')[0],
                last_name: guestName.split(' ').slice(1).join(' ') || 'Convidado',
            }
        };

        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': tx.id,
            },
            body: JSON.stringify(paymentBody)
        });

        const mpPaymentData = await mpResponse.json();

        if (!mpResponse.ok) {
            console.error('MP Payment Error:', JSON.stringify(mpPaymentData));
            throw new Error(mpPaymentData.message || 'Erro ao criar pagamento PIX');
        }

        const qrCode = mpPaymentData.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = mpPaymentData.point_of_interaction?.transaction_data?.qr_code_base64;

        // 4. Salvar o payment_id no banco
        await supabaseAdmin
            .from('gift_transactions')
            .update({ mp_preference_id: String(mpPaymentData.id) })
            .eq('id', tx.id);

        return NextResponse.json({
            transactionId: tx.id,
            paymentId: mpPaymentData.id,
            qrCode,
            qrCodeBase64,
            status: mpPaymentData.status,
        });

    } catch (error: any) {
        console.error('Erro no Checkout MP Pix Bulk:', error.message);
        return NextResponse.json({ 
            error: 'Erro ao gerar Pix no Mercado Pago',
            details: error.message,
        }, { status: 500 });
    }
}
