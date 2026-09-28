import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyEventOwnership } from '@/lib/verify-ownership';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const eventId = params.id;

        // 🔒 Verificar propriedade do evento
        const ownership = await verifyEventOwnership(req, eventId)
        if (!ownership.authorized) return ownership.response

        const { amount, pixKey, pixType, beneficiary } = await req.json();

        // 1. Validar chave Pix
        if (!pixKey || typeof pixKey !== 'string' || pixKey.trim() === '') {
            return NextResponse.json({ error: 'Chave Pix não informada. Configure seus dados Pix antes de solicitar o saque.' }, { status: 400 });
        }

        // 2. Verificar se já existe saque pendente em análise (proteção contra duplo saque)
        const { data: activePending } = await supabaseAdmin
            .from('withdrawals')
            .select('id, amount, requested_at')
            .eq('event_id', eventId)
            .ilike('status', 'pending');

        if (activePending && activePending.length > 0) {
            return NextResponse.json({
                error: 'Já existe uma solicitação de saque em análise pela administração. Aguarde a transferência antes de solicitar um novo resgate.'
            }, { status: 400 });
        }

        // 3. Auditoria rigorosa de saldo no servidor
        const now = new Date();
        const { data: approvedTransactions, error: txError } = await supabaseAdmin
            .from('gift_transactions')
            .select('id, amount_net, release_date')
            .eq('event_id', eventId)
            .eq('status', 'APPROVED');

        if (txError) {
            console.error('[WITHDRAWAL TX FETCH ERROR]', txError);
            return NextResponse.json({ error: 'Erro ao verificar saldo para saque.' }, { status: 500 });
        }

        const totalReleasedNet = (approvedTransactions || []).reduce((acc, t) => {
            if (!t.release_date || new Date(t.release_date) <= now) {
                return acc + Number(t.amount_net || 0);
            }
            return acc;
        }, 0);

        const { data: existingWithdrawals, error: wFetchError } = await supabaseAdmin
            .from('withdrawals')
            .select('id, amount, status')
            .eq('event_id', eventId);

        if (wFetchError) {
            console.error('[WITHDRAWAL FETCH ERROR]', wFetchError);
            return NextResponse.json({ error: 'Erro ao verificar histórico de saques.' }, { status: 500 });
        }

        const totalWithdrawn = (existingWithdrawals || [])
            .filter(w => {
                const st = (w.status || 'pending').toUpperCase();
                return st === 'COMPLETED' || st === 'PENDING';
            })
            .reduce((acc, w) => acc + Number(w.amount || 0), 0);

        const realAvailable = Math.max(0, Math.round((totalReleasedNet - totalWithdrawn) * 100) / 100);

        if (realAvailable <= 0) {
            return NextResponse.json({ error: 'Você não possui saldo disponível para resgate no momento.' }, { status: 400 });
        }

        const requestedAmount = Math.round(Number(amount) * 100) / 100;
        if (!requestedAmount || requestedAmount <= 0) {
            return NextResponse.json({ error: 'Valor de saque inválido.' }, { status: 400 });
        }

        if (requestedAmount > realAvailable + 0.01) {
            return NextResponse.json({
                error: `Valor solicitado (R$ ${requestedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) excede o saldo disponível (R$ ${realAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
            }, { status: 400 });
        }

        // 4. Criar a solicitação de saque (Withdrawal)
        const { data: withdrawal, error } = await supabaseAdmin
            .from('withdrawals')
            .insert({
                event_id: eventId,
                amount: requestedAmount,
                pix_key: pixKey.trim(),
                pix_type: pixType || 'CHAVE_ALEATORIA',
                beneficiary: beneficiary?.trim() || 'Não informado',
                status: 'pending'
            })
            .select()
            .single();

        if (error || !withdrawal) {
            console.error('[WITHDRAWAL ERROR]', error);
            return NextResponse.json({ error: 'Erro ao registrar solicitação de saque.' }, { status: 500 });
        }

        // 5. Vincular todas as transações liberadas disponíveis a este saque
        await supabaseAdmin
            .from('gift_transactions')
            .update({ withdrawal_id: withdrawal.id })
            .eq('event_id', eventId)
            .eq('status', 'APPROVED')
            .is('withdrawal_id', null)
            .or(`release_date.lte.${now.toISOString()},release_date.is.null`);

        // 6. Notificar Admin (Vanessa/Rodrigo) sobre novo saque
        try {
            const adminEmail = process.env.ADMIN_EMAIL || 'rodrigoindalecio@hotmail.com';
            const { sendEmail } = await import('@/lib/email');

            // Buscar dados do evento para compor e-mail amigável
            const { data: eventData } = await supabaseAdmin
                .from('events')
                .select('event_settings')
                .eq('id', eventId)
                .single();

            const settings = typeof eventData?.event_settings === 'string'
                ? JSON.parse(eventData.event_settings)
                : eventData?.event_settings;
            const coupleNames = settings?.coupleNames || 'Casal';

            const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://perfectoespaco.com.br').replace(/['"]+/g, '').trim();

            await sendEmail({
                to: adminEmail,
                subject: `💰 NOVO SAQUE: R$ ${requestedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} solicitado por ${coupleNames}!`,
                html: `
                    <div style="font-family: sans-serif; padding: 24px; border: 1px solid #eee; border-radius: 12px; background: #fff;">
                        <h2 style="color: #7C2D12; margin-top: 0;">Nova solicitação de saque! 🚀</h2>
                        <p style="font-size: 15px; color: #374151;">O casal <strong>${coupleNames}</strong> acabou de solicitar um resgate de presentes.</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 16px 0;" />
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #374151;">
                            <tr><td style="padding: 6px 0; color: #6B7280;">Valor:</td><td style="padding: 6px 0; font-weight: bold; color: #047857; font-size: 18px;">R$ ${requestedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
                            <tr><td style="padding: 6px 0; color: #6B7280;">Beneficiário:</td><td style="padding: 6px 0; font-weight: bold;">${beneficiary || 'Não informado'}</td></tr>
                            <tr><td style="padding: 6px 0; color: #6B7280;">Chave PIX:</td><td style="padding: 6px 0; font-weight: bold; font-family: monospace;">${pixKey} (${pixType || 'Chave'})</td></tr>
                            <tr><td style="padding: 6px 0; color: #6B7280;">Evento:</td><td style="padding: 6px 0;">${coupleNames} (${eventId})</td></tr>
                        </table>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                        <div style="text-align: center; margin-top: 20px;">
                            <a href="${baseUrl}/admin/withdrawals" style="background: #7C2D12; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Acessar Painel de Saques</a>
                        </div>
                    </div>
                `
            });
        } catch (mailErr) {
            console.error('[WITHDRAWAL MAIL NOTIFY ERROR]', mailErr);
        }

        return NextResponse.json({ ok: true, withdrawal });

    } catch (e) {
        console.error('[WITHDRAWAL EXCEPTION]', e);
        return NextResponse.json({ error: 'Erro interno ao processar saque.' }, { status: 500 });
    }
}
