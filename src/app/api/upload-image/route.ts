import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyAuth } from '@/lib/auth-utils'

const BUCKET_NAME = 'event-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
}

export async function POST(req: NextRequest) {
    try {
        // 🔒 1. Verificar autenticação (usuário logado ou chave interna)
        const isAuth = await verifyAuth(req)
        if (!isAuth) {
            return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const rawFolder = (formData.get('folder') as string) || 'misc'

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
        }

        // 🔒 2. Validação de Tamanho (Max 5MB)
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'O arquivo excede o limite máximo permitido de 5MB.' }, { status: 400 })
        }

        // 🔒 3. Validação estrita de tipo MIME (Whitelist de imagens)
        const mimeType = (file.type || '').toLowerCase()
        const safeExt = ALLOWED_MIME_TYPES[mimeType]
        if (!safeExt) {
            return NextResponse.json({
                error: 'Formato de imagem não suportado. Por favor, envie imagens JPG, PNG, WEBP ou GIF.'
            }, { status: 400 })
        }

        // 🔒 4. Sanitização de pasta e geração de nome criptograficamente aleatório (impede Path Traversal)
        const cleanFolder = rawFolder.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'misc'
        const safeFileName = `${Date.now()}_${crypto.randomUUID()}.${safeExt}`
        const filePath = `${cleanFolder}/${safeFileName}`

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { data, error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
                contentType: mimeType,
                cacheControl: '31536000',
                upsert: false,
            })

        if (error) {
            console.error('[upload-image] Erro de storage:', error)
            return NextResponse.json({ error: 'Erro ao salvar arquivo no servidor.' }, { status: 500 })
        }

        const { data: urlData } = supabaseAdmin.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path)

        return NextResponse.json({ url: urlData.publicUrl })
    } catch (err: any) {
        console.error('[upload-image] Erro inesperado:', err)
        return NextResponse.json({ error: 'Erro interno ao processar upload.' }, { status: 500 })
    }
}
