-- Adiciona a coluna approved_by na tabela de saques para registro de auditoria
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS approved_by TEXT;
