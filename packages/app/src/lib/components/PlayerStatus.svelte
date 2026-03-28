<script lang="ts">
  import JoinButtons from './JoinButtons.svelte'

  const { onJoin, onLeave, playerId, playerIds } = $props()
</script>

<div class="flex flex-col">
  {#if playerId !== null}
    <div>Status: Player</div>
    <div>ID: {playerId}</div>
    <button onclick={onLeave}>Leave Game</button>
  {:else}
    <div>Status: Spectator</div>
    <JoinButtons {onJoin} {playerIds} />
  {/if}
</div>
