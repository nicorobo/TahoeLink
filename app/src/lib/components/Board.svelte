<script lang="ts">
  let { gameState, onClick } = $props()
  console.log('board gameState', gameState)
</script>

<div class="inline-grid grid-cols-10">
  {#each gameState as cell, i}
    <button
      class="w-10 h-10 bg-gray-200 hover:bg-gray-300 active:bg-gray-400"
      onclick={() => onClick(i)}>
      {cell}
    </button>
  {/each}
</div>
