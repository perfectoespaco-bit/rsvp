import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// InfinitePay Public Checkout Integration
// This endpoint generates a payment link directly with InfinitePay
// based on the shopping cart contents.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, guestName, message, items, total, eventId } = body;

    const transactionId = crypto.randomUUID();
    const handle = process.env.INFINITEPAY_HANDLE || "rodrigo-indalecio";
    
    // Resolução Dinâmica de URL (Funciona em Localhost, Cloudflare e Vercel sem precisar configurar envs)
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = origin || (host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_BASE_URL?.replace(/['"]+/g, '').trim()) || 'http://localhost:3000';
    console.log(`[InfinitePay] Iniciando checkout para ${guestName} - Total: R$ ${total}`);

    // 0. Fetch real gifts to accurately calculate fees and avoid tampering
    const giftIds = items.map((item: any) => item.id);
    const { data: giftsData, error: giftsError } = await supabaseAdmin
        .from('gifts')
        .select('*, events(tax_payer, event_settings)')
        .in('id', giftIds);

    if (giftsError || !giftsData || giftsData.length === 0) {
        return NextResponse.json({ error: 'Presentes não encontrados' }, { status: 404 });
    }

    const firstGift = giftsData[0];
    const settings = typeof firstGift.events?.event_settings === 'string'
        ? JSON.parse(firstGift.events.event_settings)
        : firstGift.events?.event_settings;
        
    const feePercent = settings?.serviceTax ? Number(settings.serviceTax) / 100 : 0.0549;
    const taxPayer = firstGift.events?.tax_payer || 'COUPLE';

    let totalAmountBruto = 0;
    let totalAmountFee = 0;
    let totalAmountNet = 0;
    const infinitePayItems = [];
    const itemsForDb = [];

    for (const item of items) {
        const gift = giftsData.find(g => g.id === item.id);
        if (!gift) continue;

        const quantity = item.quantity || 1;
        const price = Number(gift.price);

        let amountBruto = price;
        let amountFee = price * feePercent;
        let amountNet = price - amountFee;

        if (taxPayer === 'GUEST') {
            amountBruto = price * (1 + feePercent);
            amountFee = amountBruto - price;
            amountNet = price;
        }

        totalAmountBruto += amountBruto * quantity;
        totalAmountFee += amountFee * quantity;
        totalAmountNet += amountNet * quantity;

        infinitePayItems.push({
            description: gift.name,
            price: Math.round(amountBruto * 100),
            quantity: quantity
        });

        itemsForDb.push({
            id: gift.id,
            name: gift.name,
            price: price,
            quantity: quantity
        });
    }

    // 1. Criar registro pendente no Banco de Dados (Supabase) - Usando supabaseAdmin para evitar bloqueios de RLS
    const { error: dbError } = await supabaseAdmin.from("gift_transactions").insert({
      id: transactionId,
      event_id: firstGift.event_id,
      guest_name: String(guestName || 'Convidado').replace(/<[^>]*>/g, '').trim().slice(0, 150),
      guest_email: body.email ? String(body.email).trim().slice(0, 150) : null,
      message: String(message || '').replace(/<[^>]*>/g, '').trim().slice(0, 1000),
      amount_bruto: totalAmountBruto,
      amount_gross: totalAmountBruto,
      amount_net: totalAmountNet,
      amount_fee: totalAmountFee,
      tax_payer: taxPayer,
      status: "PENDING",
      payment_method: "infinitepay",
      items: itemsForDb 
    });

    if (dbError) {
      console.error("[InfinitePay] Erro ao salvar transação no DB:", dbError);
      throw dbError;
    }

    // 2. Preparar itens para o formato InfinitePay (preço em centavos) já feito acima

    // 3. Chamar a API Pública da InfinitePay para gerar o link
    const response = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        handle: handle,
        order_nsu: transactionId,
        redirect_url: `${baseUrl}/${slug}/presentes/sucesso?t=${transactionId}`,
        webhook_url: `${baseUrl}/api/webhook/infinitepay`,
        items: infinitePayItems
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[InfinitePay] Erro na Resposta da API:", data);
      throw new Error(`InfinitePay API Error: ${JSON.stringify(data)}`);
    }

    // 4. Retornar a URL de pagamento gerada
    console.log(`[InfinitePay] Link gerado com sucesso: ${data.url}`);
    return NextResponse.json({ url: data.url });

  } catch (error: any) {
    console.error("[InfinitePay] Erro Crítico no Checkout:", error);
    return NextResponse.json(
      { error: "Erro ao processar checkout InfinitePay", details: error.message },
      { status: 500 }
    );
  }
}
