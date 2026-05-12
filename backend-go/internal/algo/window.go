package algo

import "time"

var saoPaulo *time.Location

func init() {
	var err error
	saoPaulo, err = time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		saoPaulo = time.FixedZone("BRT", -3*3600)
	}
}

// InSendWindow retorna true se hora local SP pertence ao intervalo [21h, 6h)
func InSendWindow() bool {
	h := time.Now().In(saoPaulo).Hour()
	return h >= 21 || h < 6
}
