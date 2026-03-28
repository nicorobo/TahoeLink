<script lang="ts">
  import { getCellBackgroundClass } from '$lib/utils/color'

  const { onJoin, playerIds } = $props()

  const players = [
    { id: 0, label: 'Red' },
    { id: 1, label: 'Blue' },
    { id: 2, label: 'Yellow' },
    { id: 3, label: 'Green' },
  ]
</script>

<div>
  {#each players as { id, label }}
    <button
      onclick={() => onJoin(id)}
      disabled={playerIds.includes(id)}
      class={`btn ${getCellBackgroundClass(id)}`}>
      Join as {label}
    </button>
  {/each}
</div>
