<script lang="ts">
  import { shapes } from '../shapes'
  import { pieceState } from '$lib/state.svelte'
  let adjustedRotation = $derived(((pieceState.rotation % 4) + 4) % 4)
  let shape = $derived(
    shapes[pieceState.shape][adjustedRotation][pieceState.flip ? 1 : 0],
  )
</script>

<div class="flex">
  {#each shape as column, i}
    <div>
      {#each shape[i] as cell}
        <div class={`${cell > 0 ? 'bg-amber-300' : ''} h-10 w-10`}></div>
      {/each}
    </div>
  {/each}
</div>
