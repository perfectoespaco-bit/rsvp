import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOwnerEmail } from '../../send-owner-notification/route';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { guestId, updates, eventSettings } = body

        const logPath = path.join(process.cwd(), 'rsvp_debug.log');
        const logEntry = (msg: string) => {
            try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`); } catch(e) {}
        };

        logEntry(`>>> Rota de RSVP: ${updates.name} (${updates.status})`);

        // 🔒 1. Proteção Bot / Honeypot: se campo oculto vier preenchido, descarta silenciosamente
        if (body.hp_website || body._gotcha) {
            return NextResponse.json({ ok: true })
        }

        if (!guestId || !updates) {
            return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 })
        }

        // 🔒 2. Sanitização de entradas contra XSS e injeção de HTML
        const sanitize = (val: any) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : ''
        const cleanName = sanitize(updates.name).slice(0, 150)
        const cleanEmail = sanitize(updates.email).slice(0, 150)
        const cleanMessage = sanitize(updates.message).slice(0, 1000)
        const validStatus = ['confirmed', 'declined', 'pending'].includes(updates.status) ? updates.status : 'pending'

        // 🔒 3. Recuperar ownerEmail estritamente do banco de dados (nunca confiar no body do cliente)
        let ownerEmail: string | null = null;
        const { data: guestData } = await supabaseAdmin.from('guests').select('event_id').eq('id', guestId).single();
        if (!guestData?.event_id) {
            return NextResponse.json({ error: 'Convidado não encontrado' }, { status: 404 });
        }
        const { data: eventData } = await supabaseAdmin.from('events').select('created_by').eq('id', guestData.event_id).single();
        if (eventData?.created_by) {
            ownerEmail = eventData.created_by;
        }

        // 4. Atualizar no Banco de Dados com dados sanitizados
        const now = new Date()
        const dbUpdates: any = { 
            updated_at: now.toISOString(),
            status: validStatus,
            email: cleanEmail || null,
            message: cleanMessage,
            name: cleanName,
            companions_list: Array.isArray(updates.companionsList) ? updates.companionsList.slice(0, 15) : []
        }

        if (validStatus === 'confirmed') {
            dbUpdates.confirmed_at = updates.confirmedAt || now.toISOString()
        } else {
            dbUpdates.confirmed_at = null
        }

        await supabaseAdmin.from('guests').update(dbUpdates).eq('id', guestId).eq('event_id', guestData.event_id)
        logEntry(`... Banco atualizado.`);

        // 2. Disparar E-mails
        const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const baseUrl = origin.replace(/['"]+/g, '').trim();
        const internalKey = (process.env.INTERNAL_API_KEY || '').trim();

        const emailPromises = [];

        // Convidado
        if (updates.status === 'confirmed' && updates.email) {
            logEntry(`... Tentando e-mail do convidado para ${updates.email}`);
            const totalPeople = (body.confirmedNames && Array.isArray(body.confirmedNames)) ? body.confirmedNames.length : 1;
            
            emailPromises.push(
                fetch(`${baseUrl}/api/send-confirmation-email`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${internalKey}`
                    },
                    body: JSON.stringify({ 
                        email: updates.email, 
                        guestName: updates.name, 
                        eventSettings,
                        confirmedCompanions: totalPeople,
                        confirmedNames: body.confirmedNames || [updates.name]
                    })
                }).then(async res => {
                    logEntry(`... Resposta Convidado (Status: ${res.status})`);
                    if (!res.ok) logEntry(`... Erro: ${await res.text()}`);
                }).catch(e => logEntry(`... Erro Fatal Convidado: ${e.message}`))
            );
        }

        // Noivos
        const notificationPrefs = eventSettings.notificationSettings || {};
        const hasMessage = updates.message && updates.message.trim().length > 0;
        
        const shouldNotifyRSVP = notificationPrefs.rsvp !== false && eventSettings.notifyOwnerOnRSVP !== false;
        const shouldNotifyMural = (notificationPrefs.mural !== false) && hasMessage;

        if ((shouldNotifyRSVP || shouldNotifyMural) && ownerEmail) {
            logEntry(`... Tentando notificação para os noivos (${ownerEmail}) - RSVP:${shouldNotifyRSVP}, Mural:${shouldNotifyMural}`);
            emailPromises.push(
                sendOwnerEmail({ 
                    ownerEmail, 
                    guestName: updates.name, 
                    eventSettings, 
                    confirmedNames: body.confirmedNames || [],
                    status: updates.status,
                    reqBaseUrl: baseUrl
                }).then(r => {
                    logEntry(`... Resposta Noivos: ${r.success ? ('ENVIADO (ID:' + r.messageId + ')') : ('FALHA:' + r.error)}`);
                }).catch(e => logEntry(`... Erro Fatal Noivos: ${e.message}`))
            );
        }

        if (emailPromises.length > 0) {
            await Promise.allSettled(emailPromises);
        }
        
        logEntry(`>>> Fluxo Concluído.`);
        return NextResponse.json({ ok: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
