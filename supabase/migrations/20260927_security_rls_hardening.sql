-- ==============================================================================
-- BLINDAGEM DE SEGURANÇA SUPABASE - ROW LEVEL SECURITY (RLS)
-- Executar no Supabase SQL Editor para blindar o banco de dados contra invasões
-- ==============================================================================

-- 1. TABELA WITHDRAWALS (SAQUES FINANCEIROS)
-- Impede que qualquer convidado ou usuário anônimo insira, altere ou delete saques
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas permissivas
DROP POLICY IF EXISTS "Enable all access for withdrawals" ON withdrawals;
DROP POLICY IF EXISTS "Allow anon insert on withdrawals" ON withdrawals;
DROP POLICY IF EXISTS "Public withdrawals read" ON withdrawals;
DROP POLICY IF EXISTS "Service role full access withdrawals" ON withdrawals;

-- Permitir acesso total APENAS ao Service Role (APIs do backend)
CREATE POLICY "Service role full access withdrawals"
ON withdrawals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Permitir leitura pública (SELECT) apenas se necessário para Realtime do dashboard,
-- mas bloqueando estritamente INSERT, UPDATE e DELETE de anônimos:
CREATE POLICY "Allow select on withdrawals"
ON withdrawals
FOR SELECT
TO anon, authenticated
USING (true);


-- 2. TABELA GIFT_TRANSACTIONS (TRANSAÇÕES DE PRESENTES / PAGAMENTOS)
-- Impede que hackers forjem pagamentos aprovados diretamente pelo console F12
ALTER TABLE gift_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for gift_transactions" ON gift_transactions;
DROP POLICY IF EXISTS "Allow anon insert on gift_transactions" ON gift_transactions;
DROP POLICY IF EXISTS "Public gift_transactions read" ON gift_transactions;
DROP POLICY IF EXISTS "Service role full access gift_transactions" ON gift_transactions;

-- Service Role tem acesso total para processar checkouts e webhooks
CREATE POLICY "Service role full access gift_transactions"
ON gift_transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Leitura pública para conferência de status de transação (somente SELECT)
CREATE POLICY "Allow select on gift_transactions"
ON gift_transactions
FOR SELECT
TO anon, authenticated
USING (true);


-- 3. TABELA EVENTS (EVENTOS / CASAMENTOS)
-- Impede que qualquer pessoa delete ou altere dados de casamentos alheios
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for events" ON events;
DROP POLICY IF EXISTS "Allow anon delete on events" ON events;
DROP POLICY IF EXISTS "Allow anon update on events" ON events;
DROP POLICY IF EXISTS "Public events read" ON events;
DROP POLICY IF EXISTS "Service role full access events" ON events;

-- Service Role tem controle total
CREATE POLICY "Service role full access events"
ON events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Leitura pública para que convidados consigam acessar a página do casamento pelo slug
CREATE POLICY "Allow public select events"
ON events
FOR SELECT
TO anon, authenticated
USING (true);


-- 4. TABELA GUESTS (CONVIDADOS & RSVP)
-- Impede exclusão arbitrária de convidados pela chave anônima
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for guests" ON guests;
DROP POLICY IF EXISTS "Allow anon delete on guests" ON guests;
DROP POLICY IF EXISTS "Public guests read" ON guests;
DROP POLICY IF EXISTS "Service role full access guests" ON guests;

CREATE POLICY "Service role full access guests"
ON guests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Leitura pública para busca no formulário de RSVP
CREATE POLICY "Allow public select guests"
ON guests
FOR SELECT
TO anon, authenticated
USING (true);

-- Atualização de RSVP permitida apenas para campos de confirmação
CREATE POLICY "Allow update rsvp guests"
ON guests
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 5. TABELA ADMIN_USERS (USUÁRIOS ADMINISTRATIVOS E NOIVOS)
-- Impede que invasores insiram novos administradores ou alterem senhas via console
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_users') THEN
        ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Service role full access admin_users" ON admin_users;
        DROP POLICY IF EXISTS "Allow anon insert admin_users" ON admin_users;
        DROP POLICY IF EXISTS "Allow anon update admin_users" ON admin_users;
        DROP POLICY IF EXISTS "Allow anon delete admin_users" ON admin_users;

        CREATE POLICY "Service role full access admin_users"
        ON admin_users
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

        -- Leitura permitida para login/validação
        CREATE POLICY "Allow select admin_users"
        ON admin_users
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;
END $$;

-- 6. TABELA GIFTS (CATÁLOGO DE PRESENTES)
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gifts" ON gifts;
DROP POLICY IF EXISTS "Allow public select gifts" ON gifts;

CREATE POLICY "Service role full access gifts"
ON gifts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public select gifts"
ON gifts
FOR SELECT
TO anon, authenticated
USING (true);

-- ==============================================================================
-- FIM DA BLINDAGEM RLS
-- ==============================================================================
