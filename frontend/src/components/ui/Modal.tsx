import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Largura do painel (Tailwind), ex.: max-w-3xl */
  panelClassName?: string
}

export function Modal({ open, onClose, title, children, footer, panelClassName = 'max-w-lg' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full mx-4 max-h-[90vh] min-h-0 flex flex-col',
            'rounded-lg border border-border bg-surface shadow-modal',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            panelClassName
          )}
        >
          {title && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <Dialog.Title className="text-sm font-semibold text-fg">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="text-fg-3 hover:text-fg transition-colors p-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  aria-label="Fechar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
          )}
          <div className="overflow-y-auto px-4 py-4 flex-1 min-h-0">
            {children}
          </div>
          {footer && (
            <div className="px-4 py-3 border-t border-border flex justify-end gap-2 shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
