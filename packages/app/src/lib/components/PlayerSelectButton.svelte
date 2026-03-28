<script lang="ts">
  import { getCellBackgroundClass } from '$lib/utils/color'
  let { playerId, selected, disabled, onJoin, onLeave } = $props()
</script>

<div class={`${getCellBackgroundClass(playerId)}`}>
  <div>
    <div>Player {playerId + 1}</div>
  </div>
  {#if !selected}
    <button {disabled} onclick={() => onJoin(playerId)}>Join</button>
  {:else}
    <button onclick={onLeave}>Leave</button>
  {/if}
</div>
