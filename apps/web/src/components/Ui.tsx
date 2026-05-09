import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const base =
    'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? 'bg-violet-600 text-white hover:bg-violet-700'
      : variant === 'secondary'
        ? 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'
        : variant === 'danger'
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40'
  return <button type="button" className={`${base} ${styles} ${className}`} {...props} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 ${className}`}
      {...props}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      {...props}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{children}</label>
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-[96px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      {...props}
    />
  )
}
