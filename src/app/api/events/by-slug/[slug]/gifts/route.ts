import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: { slug: string } }
) {
    try {
        const { slug } = params;

        // Primeiro tenta pela coluna direta (novo formato)
        let { data: event } = await supabaseAdmin
            .from('events')
            .select('id, gift_list_enabled, tax_payer')
            .eq('slug', slug)
            .maybeSingle();

        // Fallback: busca pelo JSON eventSettings (formato legado controle_acesso)
        if (!event) {
            const { data: events } = await supabaseAdmin
                .from('events')
                .select('id, gift_list_enabled, tax_payer, eventSettings')
                .not('eventSettings', 'is', null);

            if (events && events.length > 0) {
                const found = events.find((e: any) => {
                    try {
                        const settings = typeof e.eventSettings === 'string'
                            ? JSON.parse(e.eventSettings)
                            : e.eventSettings;
                        return settings?.slug?.toLowerCase() === slug.toLowerCase();
                    } catch { return false; }
                });
                if (found) {
                    event = {
                        id: found.id,
                        gift_list_enabled: found.gift_list_enabled,
                        tax_payer: found.tax_payer || 'COUPLE'
                    };
                }
            }
        }

        if (!event) {
            return NextResponse.json({ gifts: [] });
        }

        // Busca os presentes ativos (independente de gift_list_enabled para não bloquear o dev)
        const { data: gifts, error } = await supabaseAdmin
            .from('gifts')
            .select('id, name, description, price, image_url, active, "order", category, subcategory, quantity, is_quota')
            .eq('event_id', event.id)
            .eq('active', true)
            .order('order', { ascending: true });

        if (error) {
            console.error('[PUBLIC GIFTS]', error);
            return NextResponse.json({ gifts: [] });
        }

        return NextResponse.json({
            gifts: gifts || [],
            eventId: event.id,
            settings: {
                taxPayer: event.tax_payer || 'COUPLE'
            }
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' // Cache de 5min, serve cache por 10min enquanto valida
            }
        });

    } catch (e) {
        console.error('[PUBLIC GIFTS] Exception:', e);
        return NextResponse.json({ gifts: [] });
    }
}
