export interface Toast {
	id: number
	message: string
	type: 'error' | 'info'
}

let nextId = 0

export const toasts = $state<Toast[]>([])

export function addToast(message: string, type: 'error' | 'info' = 'error'): void {
	const id = nextId++
	toasts.push({ id, message, type })
	const timeout = type === 'error' ? 5000 : 3000
	setTimeout(() => {
		const idx = toasts.findIndex(t => t.id === id)
		if (idx >= 0) toasts.splice(idx, 1)
	}, timeout)
}