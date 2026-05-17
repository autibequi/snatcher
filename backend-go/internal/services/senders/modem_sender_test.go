package senders

import (
	"context"
	"errors"
	"testing"
)

// TestIPModemSenderStub_Send verifica que Send retorna ErrModemNotImplemented,
// sinalizando que IP modem direto está fora do escopo W1.
func TestIPModemSenderStub_Send(t *testing.T) {
	stub := NewIPModemSenderStub("192.168.1.1")

	_, err := stub.Send(context.Background(), SendPayload{
		GroupJID:    "5511999999999@g.us",
		MessageBody: "teste",
	})
	if !errors.Is(err, ErrModemNotImplemented) {
		t.Errorf("esperado ErrModemNotImplemented, got %v", err)
	}
}

// TestIPModemSenderStub_ID verifica que o ID inclui o IP configurado.
func TestIPModemSenderStub_ID(t *testing.T) {
	ip := "10.0.0.5"
	stub := NewIPModemSenderStub(ip)

	id := stub.ID()
	if id != "ip_modem_stub:"+ip {
		t.Errorf("esperado 'ip_modem_stub:%s', got %q", ip, id)
	}
}

// TestEvolutionAPISender_ImplementsModemSender verifica em tempo de compilação que
// EvolutionAPISender satisfaz a interface ModemSender.
func TestEvolutionAPISender_ImplementsModemSender(t *testing.T) {
	var _ ModemSender = NewEvolutionAPISender("http://localhost", "key")
}

// TestIPModemSenderStub_ImplementsModemSender verifica em tempo de compilação que
// IPModemSenderStub satisfaz a interface ModemSender.
func TestIPModemSenderStub_ImplementsModemSender(t *testing.T) {
	var _ ModemSender = NewIPModemSenderStub("127.0.0.1")
}

// TestEvolutionAPISender_Send_ReturnsStubResult verifica que Send W1 retorna resultado
// fixo não-nil (stub — lógica HTTP real vem em W2+).
func TestEvolutionAPISender_Send_ReturnsStubResult(t *testing.T) {
	sender := NewEvolutionAPISender("http://localhost:8080", "test-key")

	result, err := sender.Send(context.Background(), SendPayload{
		GroupJID:    "5511999999999@g.us",
		MessageBody: "olá",
	})
	if err != nil {
		t.Fatalf("não esperava erro, got %v", err)
	}
	if result == nil {
		t.Fatal("resultado não deve ser nil")
	}
	if result.MessageID == "" {
		t.Error("MessageID não deve ser vazio no stub")
	}
}
