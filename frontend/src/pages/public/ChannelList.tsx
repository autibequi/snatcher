// Placeholder — estrutura pronta para implementação futura
// TODO: buscar /api/public/channels/:slug e listar promoções do canal

export default function ChannelList() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <p className="text-2xl font-semibold text-fg">Em breve</p>
      <p className="text-sm text-fg-2 max-w-sm">
        A listagem detalhada por canal está sendo preparada. Em breve você poderá
        ver todas as promoções de cada canal aqui.
      </p>
      <a href="/" className="text-sm text-accent hover:underline mt-2">
        Voltar ao início
      </a>
    </div>
  )
}
