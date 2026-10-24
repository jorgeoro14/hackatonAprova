import onDark from '@/assets/logo/aprova-wordmark-on-dark.svg'
import onLight from '@/assets/logo/aprova-wordmark-on-light.svg'
import { cn } from '@/lib/utils/cn'

/** Logo da Aprova: versão clara no tema escuro e escura no tema claro (troca por [data-theme]). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex', className)} role="img" aria-label="Aprova">
      <img src={onLight} alt="" className="logo-on-light h-full w-auto" />
      <img src={onDark} alt="" className="logo-on-dark h-full w-auto" />
    </span>
  )
}
