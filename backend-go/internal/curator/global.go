package curator

// GlobalConfirmer é o singleton compartilhado entre router e scheduler.
// Inicializado no startup via SetGlobals ou diretamente.
var GlobalConfirmer = NewConfirmer()

// GlobalSender é o Sender Evolution padrão (lê env vars).
// Pode ser substituído por um mock em testes.
var GlobalSender Sender = NewEvolutionSenderFromEnv()
