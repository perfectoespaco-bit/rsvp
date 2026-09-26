import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAuth, getSession } from '@/lib/auth-utils';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const isAuth = await verifyAuth(req, true);
        if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const session = await getSession();
        const adminEmail = session?.email || 'System';

        const formData = await req.formData();
        const status = formData.get('status') as string;
        const rejectReason = formData.get('rejection_reason') as string | null;
        const file = formData.get('receipt') as File | null;
        const forceApproval = formData.get('force') === 'true';

        // Security: Check for high value
        if (status === 'COMPLETED' && !forceApproval) {
            const { data: currentW } = await supabaseAdmin.from('withdrawals').select('amount').eq('id', params.id).single();
            if (currentW && Number(currentW.amount) >= 5000) {
                return NextResponse.json({ 
                    error: 'HIGH_VALUE_LOCKED', 
                    message: `Este saque de R$ ${Number(currentW.amount).toLocaleString()} exige aprovação de nível mestre due ao alto valor.` 
                }, { status: 403 });
            }
        }

        let receiptUrl = null;

        if (status === 'COMPLETED' && file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `withdrawals/${params.id}_${Date.now()}.${fileExt}`;
            
            const buffer = Buffer.from(await file.arrayBuffer());

            const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('receipts')
                .upload(fileName, buffer, { contentType: file.type });

            if (uploadError) {
                console.error('[UPLOAD ERROR]', uploadError);
                return NextResponse.json({ error: 'Erro ao enviar comprovante.' }, { status: 500 });
            }

            const { data: publicUrlData } = supabaseAdmin.storage.from('receipts').getPublicUrl(fileName);
            receiptUrl = publicUrlData.publicUrl;
        }

        const updateData: any = {
            status,
            completed_at: new Date().toISOString(),
            approved_by: adminEmail // Audit Trail
        };

        if (receiptUrl) updateData.receipt_url = receiptUrl;
        if (rejectReason) updateData.rejection_reason = rejectReason;
        
        // Se for recusado, queremos Desvincular os presentes que haviam sido atrelados a ele!
        if (status === 'REJECTED') {
            await supabaseAdmin.from('gift_transactions')
                .update({ withdrawal_id: null })
                .eq('withdrawal_id', params.id);
        }

        let { data, error } = await supabaseAdmin
            .from('withdrawals')
            .update(updateData)
            .eq('id', params.id)
            .select()
            .single();

        // Se o Supabase reclamar que a coluna 'approved_by' não existe, tenta atualizar sem ela
        if (error && (error.message?.includes('approved_by') || error.details?.includes('approved_by'))) {
            delete updateData.approved_by;
            const retry = await supabaseAdmin
                .from('withdrawals')
                .update(updateData)
                .eq('id', params.id)
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        // 📧 Enviar Email para o Casal notificando sobre o status do saque
        try {
            const reqBaseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            const { data: eventData } = await supabaseAdmin
                .from('events')
                .select('event_settings, created_by, notification_settings')
                .eq('id', data.event_id)
                .single();

            if (eventData) {
                const userEmail = eventData.created_by;
                const notificationPrefs = eventData.notification_settings || {};
                const shouldNotify = notificationPrefs.withdrawals !== false;

                if (!shouldNotify) {
                    console.log('Notificação de saque desativada pelo usuário.');
                    return NextResponse.json({ ok: true, data });
                }

                const settings = typeof eventData.event_settings === 'string' 
                    ? JSON.parse(eventData.event_settings) 
                    : eventData.event_settings;
                const coupleNames = settings?.coupleNames || 'Casal';

                const { sendEmail } = await import('@/lib/email');
                
                if (status === 'COMPLETED') {
                    await sendEmail({
                        to: userEmail,
                        subject: `💸 DINHEIRO NA CONTA: Seu saque de R$ ${data.amount.toLocaleString('pt-BR')} foi pago!`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #7C2D12; border-radius: 12px; background: #fff;">
                                <h1 style="color: #10B981;">Oba, ${coupleNames}! 🎉</h1>
                                <p style="font-size: 16px; color: #374151;">Gostaríamos de informar que seu saque de <strong>R$ ${data.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> acaba de ser processado com sucesso!</p>
                                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                                ${receiptUrl ? `<p style="font-size: 14px; font-weight: bold; color: #7C2D12;">📄 Veja o comprovante anexado: <a href="${receiptUrl}" style="color: #7C2D12; text-decoration: underline;">Baixar Recibo</a></p>` : ''}
                                <p style="font-size: 14px; color: #6B7280; margin-top: 20px;">O valor deve aparecer em sua conta em breve conforme os prazos bancários. Parabéns!</p>
                                <div style="margin-top: 30px; text-align: center;">
                                    <a href="${reqBaseUrl}/painel" style="background: #7C2D12; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Acessar Dashboard</a>
                                </div>
                            </div>
                        `
                    });
                } else if (status === 'REJECTED') {
                    await sendEmail({
                        to: userEmail,
                        subject: `❌ Atenção: Seu pedido de saque não pôde ser processado`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #EF4444; border-radius: 12px; background: #fff;">
                                <h1 style="color: #EF4444;">Olá, ${coupleNames}. ⚠️</h1>
                                <p style="font-size: 16px; color: #374151;">Infelizmente sua solicitação de saque de <strong>R$ ${data.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> foi recusada pela nossa auditoria.</p>
                                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                                <div style="background: #FEF2F2; border: 1px solid #FEE2E2; padding: 15px; border-radius: 8px;">
                                    <p style="font-size: 13px; font-weight: bold; color: #991B1B; margin: 0 0 5px 0;">MOTIVO DA RECUSA:</p>
                                    <p style="font-size: 14px; color: #B91C1C; margin: 0; font-style: italic;">"${rejectReason || 'Não informado. Por favor, revise seus dados de pagamento.'}"</p>
                                </div>
                                <p style="font-size: 14px; color: #6B7280; margin-top: 20px;">O valor já retornou para o seu saldo disponível. Você pode conferir seus dados PIX nas configurações e solicitar um novo saque a qualquer momento.</p>
                                <div style="margin-top: 30px; text-align: center;">
                                    <a href="${reqBaseUrl}/painel" style="background: #EF4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Revisar Dados PIX</a>
                                </div>
                            </div>
                        `
                    });
                }
            }
        } catch (mailErr) {
            console.error('[WITHDRAWAL NOTIFY ERROR]', mailErr);
        }

        return NextResponse.json({ ok: true, data });
    } catch (e: any) {
        console.error('[ADMIN WITHDRAWAL PATCH]', e);
        return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
    }
}
