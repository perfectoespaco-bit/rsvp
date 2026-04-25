import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Busca os status das listas/grupos
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('gift_library_config')
            .select('*');

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Atualiza o status de uma lista/grupo
export async function POST(req: Request) {
    try {
        const { id, is_enabled } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('gift_library_config')
            .upsert({ 
                id, 
                is_enabled, 
                updated_at: new Date().toISOString() 
            });

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
