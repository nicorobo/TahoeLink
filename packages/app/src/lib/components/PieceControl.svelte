<script lang="ts">
  import type { Shape } from '@tahoelink/shared'
  import { pieceState } from '$lib/state.svelte'
  const shapes = ['L', 'O', 'S', 'T', 'I'] as Shape[]
</script>

<div>
  {#each shapes as shape}
    <button onclick={() => (pieceState.shape = shape)}>{shape}</button>
  {/each}
</div>
<div>
  <button onclick={() => (pieceState.rotation += 1)}>⬅️</button>
  <button onclick={() => (pieceState.rotation += 1)}>➡️</button>
  <button onclick={() => (pieceState.flip = !pieceState.flip)}>🔄</button>
</div>
