-- Migration: janela temporal de falhas consecutivas.
-- last_failure_at permite que o contador consecutive_failures decaia no tempo:
-- falhas isoladas e espaçadas não acumulam até a quarentena — só falhas que se
-- agrupam dentro da janela contam. Antes o contador só zerava num envio com sucesso,
-- o que transformava "5 falhas seguidas" em "5 falhas sem sucesso no meio" (mesmo
-- espalhadas por dias) → falso positivo de quarentena.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
