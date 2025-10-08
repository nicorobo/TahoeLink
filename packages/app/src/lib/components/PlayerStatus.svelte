<script lang="ts">
  import { playerState } from '$lib/state.svelte'
  const { onJoin } = $props()
</script>

<div class="flex flex-col">
  {#if playerState}
    <div>Status: Player</div>
    <div>Name: {playerState.name}</div>
    <div>Color: {playerState.color}</div>
    <button onclick={() => {}}>Leave Game</button>
  {:else}
    <div>Status: Spectator</div>
    <button onclick={() => onJoin(0)}>Join as Red</button>
    <button onclick={() => onJoin(1)}>Join as Blue</button>
    <button onclick={() => onJoin(2)}>Join as Yellow</button>
    <button onclick={() => onJoin(3)}>Join as Green</button>
  {/if}
</div>
