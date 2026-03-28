<script lang="ts">
  import { getCellBorderClasses } from '$lib/utils/border'
  import { getCellBackgroundClass } from '$lib/utils/color'
  let { board, onClick } = $props()
</script>

<div class="inline-grid grid-flow-col grid-rows-10">
  {#each board as column, i}
    {#each column as cell, j}
      <button
        class={`w-10 h-10 ${getCellBackgroundClass(cell)} hover:bg-gray-300 active:bg-gray-400 border border-gray-100 ${getCellBorderClasses(board, cell, i, j)}`}
        onclick={() => onClick(i)}>
      </button>
    {/each}
  {/each}
</div>
