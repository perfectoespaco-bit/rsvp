-- Tabela para gerenciar a visibilidade das listas da biblioteca
CREATE TABLE IF NOT EXISTS gift_library_config (
    id TEXT PRIMARY KEY, -- Ex: 'section:DESTAQUES' ou 'collection:gramado'
    is_enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS (opcional, mas recomendado por seguranca)
ALTER TABLE gift_library_config ENABLE ROW LEVEL SECURITY;

-- Permissoes (Acesso total para service_role e leitura para anon/authenticated)
CREATE POLICY "Leitura publica para gift_library_config" ON gift_library_config
    FOR SELECT USING (true);

CREATE POLICY "Escrita total para service_role" ON gift_library_config
    FOR ALL USING (true);
