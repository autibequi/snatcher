import { Badge, Button, Input, KpiCard, ScoreBar, Skeleton, EmptyState, Spinner, Switch, Tabs } from '../components/ui'

export default function DevAtoms() {
  return (
    <div className="p-8 space-y-8">
      <section>
        <p className="text-xs text-fg-3 mb-2">Badge</p>
        <div className="flex gap-2 flex-wrap">
          <Badge>default</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="accent">accent</Badge>
          <Badge variant="outline">outline</Badge>
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Button</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary">primary</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="danger">danger</Button>
          <Button loading>loading</Button>
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Input</p>
        <div className="max-w-xs space-y-2">
          <Input label="Label normal" placeholder="placeholder..." />
          <Input label="Com erro" error="Campo obrigatório" placeholder="..." />
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">KpiCard</p>
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          <KpiCard label="Disparos" value={124} delta={{ value: 12.5, label: "vs ontem" }} />
          <KpiCard label="Cliques" value="1.2k" />
          <KpiCard label="Receita" value="R$ 340" delta={{ value: -3.1 }} />
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">ScoreBar</p>
        <div className="max-w-xs space-y-2">
          <ScoreBar value={85} />
          <ScoreBar value={45} />
          <ScoreBar value={20} />
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Skeleton</p>
        <div className="max-w-xs space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="circle" />
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">EmptyState</p>
        <EmptyState title="Nada aqui" description="Crie algo para começar." cta={{ label: 'Criar', onClick: () => {} }} />
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Spinner</p>
        <div className="flex gap-4 items-center">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Switch</p>
        <Switch checked={true} onChange={() => {}} label="Ligado" />
      </section>

      <section>
        <p className="text-xs text-fg-3 mb-2">Tabs</p>
        <Tabs
          tabs={[{ id: 'a', label: 'Tab A' }, { id: 'b', label: 'Tab B' }]}
          active="a"
          onChange={() => {}}
        />
      </section>
    </div>
  )
}
