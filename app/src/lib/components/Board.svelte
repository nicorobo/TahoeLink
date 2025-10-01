<script lang="ts">
  let { board, onClick } = $props()
</script>

<div class="inline-grid grid-flow-col grid-rows-10">
  {#each board as column, i}
    {#each column as cell, j}
      <button
        class={`w-10 h-10 ${cell > 0 ? 'bg-amber-400' : 'bg-white'} hover:bg-gray-300 active:bg-gray-400 border text-xs`}
        onclick={() => onClick(i)}>
      </button>
    {/each}
  {/each}
</div>
