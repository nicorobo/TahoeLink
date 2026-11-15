<script lang="ts">
  import { toasts } from '$lib/toast.svelte'
</script>

{#each toasts as toast (toast.id)}
  <div
    class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 motion-reduce:animate-none animate-fade-in"
    class:text-white={toast.type === 'error'}
    class:bg-red-600={toast.type === 'error'}
    class:bg-gray-700={toast.type === 'info'}
    role="alert"
  >
    {toast.message}
  </div>
{/each}

<style>
  @keyframes toast-fade-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: toast-fade-in 0.2s ease-out;
  }
</style>