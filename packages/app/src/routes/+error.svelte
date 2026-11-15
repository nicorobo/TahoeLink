<script lang="ts">
  import { page } from '$app/state'
  let status = $derived(page.status)
  let errorMessage = $derived(page.error?.message ?? 'An unexpected error occurred')
</script>

<div class="flex flex-col items-center gap-4 py-16">
  <h1 class="text-2xl font-bold">{status}</h1>
  <p class="text-gray-500">{errorMessage}</p>
  <a href="/" class="px-4 py-2 rounded-lg bg-gray-800 text-white font-semibold hover:bg-gray-700 text-sm">Home</a>
</div>